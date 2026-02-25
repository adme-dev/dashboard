/**
 * ChatRoom Durable Object
 *
 * Real-time chat room using Hibernatable WebSocket API + SQLite for hot storage.
 * Messages are periodically archived to Neon Postgres via alarm().
 */

interface ConnectionMeta {
  userId: string
  userName: string
  userAvatar?: string
  channelId: string
}

interface IncomingMessage {
  type: 'message' | 'typing' | 'edit' | 'delete' | 'reaction' | 'presence'
  content?: string
  messageId?: number
  threadParentId?: number
  emoji?: string
  metadata?: Record<string, unknown>
}

interface OutgoingMessage {
  type: string
  [key: string]: unknown
}

interface Env {
  CHAT_QUEUE: Queue
  API_URL: string
  INTERNAL_API_KEY: string
}

export class ChatRoom extends DurableObject<Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql

    ctx.blockConcurrencyWhile(async () => {
      this.migrate()
    })
  }

  private migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_avatar TEXT,
        content TEXT NOT NULL,
        thread_parent_id INTEGER,
        edited_at TEXT,
        deleted INTEGER DEFAULT 0,
        metadata TEXT,
        archived INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_parent_id);
      CREATE INDEX IF NOT EXISTS idx_msg_archived ON messages(archived) WHERE archived = 0;

      CREATE TABLE IF NOT EXISTS reactions (
        message_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (message_id, user_id, emoji)
      );

      CREATE TABLE IF NOT EXISTS members (
        user_id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL,
        user_avatar TEXT,
        last_seen TEXT DEFAULT (datetime('now'))
      );
    `)
  }

  /**
   * Handle HTTP requests — only WebSocket upgrades accepted
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const channelId = url.pathname.split('/').pop() || 'unknown'
    const upgradeHeader = request.headers.get('Upgrade')

    if (upgradeHeader !== 'websocket') {
      // REST endpoint: return online users
      if (url.pathname.endsWith('/online')) {
        return Response.json({ users: this.getOnlineUsers() })
      }
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const userId = url.searchParams.get('userId')
    const userName = url.searchParams.get('userName') || 'Anonymous'
    const userAvatar = url.searchParams.get('userAvatar') || undefined

    if (!userId) {
      return new Response('userId required', { status: 401 })
    }

    // Create WebSocket pair
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    // Accept with Hibernatable API — tagged with channelId
    this.ctx.acceptWebSocket(server, [channelId])

    // Attach user metadata for hibernation recovery
    server.serializeAttachment({ userId, userName, userAvatar, channelId } satisfies ConnectionMeta)

    // Upsert member record
    this.sql.exec(
      `INSERT INTO members (user_id, user_name, user_avatar, last_seen)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         user_name = excluded.user_name,
         user_avatar = excluded.user_avatar,
         last_seen = datetime('now')`,
      userId, userName, userAvatar ?? null
    )

    // Send recent messages to new connection
    const recent = this.loadRecentMessages(50)
    if (recent.length > 0) {
      server.send(JSON.stringify({ type: 'history', messages: recent }))
    }

    // Broadcast presence join
    this.broadcast({
      type: 'presence',
      event: 'joined',
      userId,
      userName,
      userAvatar,
      activeUsers: this.getOnlineUsers()
    }, server)

    // Schedule archive alarm if not already set
    const currentAlarm = await this.ctx.storage.getAlarm()
    if (!currentAlarm) {
      await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000) // 5 min
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * Hibernatable WebSocket message handler
   */
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const meta = ws.deserializeAttachment() as ConnectionMeta | null
    if (!meta) return

    let msg: IncomingMessage
    try {
      msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data))
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))
      return
    }

    switch (msg.type) {
      case 'message':
        await this.handleNewMessage(ws, meta, msg)
        break

      case 'typing':
        this.broadcast({
          type: 'typing',
          userId: meta.userId,
          userName: meta.userName,
          isTyping: true
        }, ws)
        break

      case 'edit':
        this.handleEdit(ws, meta, msg)
        break

      case 'delete':
        this.handleDelete(ws, meta, msg)
        break

      case 'reaction':
        this.handleReaction(ws, meta, msg)
        break

      case 'presence':
        ws.send(JSON.stringify({
          type: 'presence',
          event: 'status',
          activeUsers: this.getOnlineUsers()
        }))
        break

      default:
        ws.send(JSON.stringify({ type: 'error', error: `Unknown type: ${msg.type}` }))
    }
  }

  /**
   * Insert message into SQLite, broadcast, enqueue for archival
   */
  private async handleNewMessage(ws: WebSocket, meta: ConnectionMeta, msg: IncomingMessage) {
    const cursor = this.sql.exec(
      `INSERT INTO messages (user_id, user_name, user_avatar, content, thread_parent_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, created_at`,
      meta.userId,
      meta.userName,
      meta.userAvatar ?? null,
      msg.content ?? '',
      msg.threadParentId ?? null,
      msg.metadata ? JSON.stringify(msg.metadata) : null
    )
    const row = [...cursor][0]
    const messageId = row['id'] as number
    const createdAt = row['created_at'] as string

    const outgoing: OutgoingMessage = {
      type: 'message',
      id: messageId,
      userId: meta.userId,
      userName: meta.userName,
      userAvatar: meta.userAvatar,
      content: msg.content,
      threadParentId: msg.threadParentId ?? null,
      metadata: msg.metadata ?? {},
      createdAt
    }

    // Broadcast to everyone including sender (sender uses id for confirmation)
    this.broadcast(outgoing)

    // Enqueue notification for async processing
    try {
      await this.env.CHAT_QUEUE.send({
        type: 'new_message',
        channelId: meta.channelId,
        messageId,
        userId: meta.userId,
        userName: meta.userName,
        content: msg.content,
        threadParentId: msg.threadParentId ?? null,
        metadata: msg.metadata ?? {},
        createdAt
      })
    } catch (err) {
      console.error('[ChatRoom] Queue send failed:', err)
    }
  }

  private handleEdit(_ws: WebSocket, meta: ConnectionMeta, msg: IncomingMessage) {
    if (!msg.messageId) return

    this.sql.exec(
      `UPDATE messages SET content = ?, edited_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      msg.content ?? '', msg.messageId, meta.userId
    )

    this.broadcast({
      type: 'edit',
      messageId: msg.messageId,
      content: msg.content,
      userId: meta.userId,
      editedAt: new Date().toISOString()
    })
  }

  private handleDelete(_ws: WebSocket, meta: ConnectionMeta, msg: IncomingMessage) {
    if (!msg.messageId) return

    this.sql.exec(
      `UPDATE messages SET deleted = 1 WHERE id = ? AND user_id = ?`,
      msg.messageId, meta.userId
    )

    this.broadcast({
      type: 'delete',
      messageId: msg.messageId,
      userId: meta.userId
    })
  }

  private handleReaction(_ws: WebSocket, meta: ConnectionMeta, msg: IncomingMessage) {
    if (!msg.messageId || !msg.emoji) return

    // Toggle reaction
    const existing = [...this.sql.exec(
      `SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
      msg.messageId, meta.userId, msg.emoji
    )]

    if (existing.length > 0) {
      this.sql.exec(
        `DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
        msg.messageId, meta.userId, msg.emoji
      )
    } else {
      this.sql.exec(
        `INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)`,
        msg.messageId, meta.userId, msg.emoji
      )
    }

    // Aggregate reactions for this message
    const reactions = [...this.sql.exec(
      `SELECT emoji, GROUP_CONCAT(user_id) as user_ids, COUNT(*) as count
       FROM reactions WHERE message_id = ? GROUP BY emoji`,
      msg.messageId
    )].map(r => ({
      emoji: r['emoji'] as string,
      userIds: (r['user_ids'] as string).split(','),
      count: r['count'] as number
    }))

    this.broadcast({
      type: 'reaction',
      messageId: msg.messageId,
      reactions
    })
  }

  /**
   * Hibernation: client disconnected
   */
  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean) {
    const meta = ws.deserializeAttachment() as ConnectionMeta | null
    ws.close(code, 'Durable Object is closing WebSocket')

    if (meta) {
      this.broadcast({
        type: 'presence',
        event: 'left',
        userId: meta.userId,
        userName: meta.userName,
        activeUsers: this.getOnlineUsers()
      })
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error('[ChatRoom] WebSocket error:', error)
    const meta = ws.deserializeAttachment() as ConnectionMeta | null
    if (meta) {
      this.broadcast({
        type: 'presence',
        event: 'left',
        userId: meta.userId,
        userName: meta.userName,
        activeUsers: this.getOnlineUsers()
      })
    }
  }

  /**
   * Periodic alarm: flush un-archived messages to Neon
   */
  async alarm() {
    const unarchived = [...this.sql.exec(
      `SELECT id, user_id, user_name, user_avatar, content, thread_parent_id,
              edited_at, deleted, metadata, created_at
       FROM messages WHERE archived = 0 ORDER BY id ASC LIMIT 200`
    )]

    if (unarchived.length === 0) return

    // Get channelId from any active connection, or from storage
    let channelId: string | null = null
    const sockets = this.ctx.getWebSockets()
    if (sockets.length > 0) {
      const meta = sockets[0].deserializeAttachment() as ConnectionMeta | null
      channelId = meta?.channelId ?? null
    }

    if (!channelId) {
      // Store channelId in KV on first message for recovery
      channelId = (await this.ctx.storage.get<string>('channelId')) ?? null
    }

    if (!channelId) {
      console.error('[ChatRoom] No channelId available for archival')
      // Re-schedule
      await this.ctx.storage.setAlarm(Date.now() + 60_000)
      return
    }

    const messages = unarchived.map(row => ({
      doMessageId: row['id'] as number,
      userId: row['user_id'] as string,
      content: row['content'] as string,
      threadParentId: row['thread_parent_id'] as number | null,
      editedAt: row['edited_at'] as string | null,
      deletedAt: row['deleted'] === 1 ? row['edited_at'] || new Date().toISOString() : null,
      metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : {},
      createdAt: row['created_at'] as string
    }))

    try {
      const resp = await fetch(`${this.env.API_URL}/api/internal/chat-archive`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.INTERNAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channelId, messages })
      })

      if (resp.ok) {
        const ids = unarchived.map(r => r['id'] as number)
        // Mark as archived in batches
        const placeholders = ids.map(() => '?').join(',')
        this.sql.exec(`UPDATE messages SET archived = 1 WHERE id IN (${placeholders})`, ...ids)
      } else {
        console.error('[ChatRoom] Archive failed:', resp.status, await resp.text())
      }
    } catch (err) {
      console.error('[ChatRoom] Archive fetch failed:', err)
    }

    // Re-schedule if there are more un-archived messages or active connections
    const moreUnarchived = [...this.sql.exec(
      `SELECT COUNT(*) as c FROM messages WHERE archived = 0`
    )]
    const hasMore = (moreUnarchived[0]?.['c'] as number) > 0
    const hasConnections = this.ctx.getWebSockets().length > 0

    if (hasMore || hasConnections) {
      await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    }
  }

  // --- Helpers ---

  private broadcast(message: OutgoingMessage, exclude?: WebSocket) {
    const data = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(data)
        } catch {
          // Socket may have closed between iteration and send
        }
      }
    }
  }

  private getOnlineUsers(): Array<{ userId: string; userName: string; userAvatar?: string }> {
    const users = new Map<string, { userId: string; userName: string; userAvatar?: string }>()
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as ConnectionMeta | null
      if (meta) {
        users.set(meta.userId, {
          userId: meta.userId,
          userName: meta.userName,
          userAvatar: meta.userAvatar
        })
      }
    }
    return [...users.values()]
  }

  private loadRecentMessages(limit: number) {
    const rows = [...this.sql.exec(
      `SELECT m.id, m.user_id, m.user_name, m.user_avatar, m.content,
              m.thread_parent_id, m.edited_at, m.deleted, m.metadata, m.created_at
       FROM messages m
       WHERE m.deleted = 0
       ORDER BY m.id DESC LIMIT ?`,
      limit
    )]

    // Load reactions for these messages
    const messageIds = rows.map(r => r['id'] as number)
    const reactionsMap = new Map<number, Array<{ emoji: string; userIds: string[]; count: number }>>()

    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',')
      const reactionRows = [...this.sql.exec(
        `SELECT message_id, emoji, GROUP_CONCAT(user_id) as user_ids, COUNT(*) as count
         FROM reactions WHERE message_id IN (${placeholders}) GROUP BY message_id, emoji`,
        ...messageIds
      )]
      for (const r of reactionRows) {
        const mid = r['message_id'] as number
        if (!reactionsMap.has(mid)) reactionsMap.set(mid, [])
        reactionsMap.get(mid)!.push({
          emoji: r['emoji'] as string,
          userIds: (r['user_ids'] as string).split(','),
          count: r['count'] as number
        })
      }
    }

    return rows.reverse().map(row => ({
      id: row['id'],
      userId: row['user_id'],
      userName: row['user_name'],
      userAvatar: row['user_avatar'],
      content: row['content'],
      threadParentId: row['thread_parent_id'],
      editedAt: row['edited_at'],
      metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : {},
      reactions: reactionsMap.get(row['id'] as number) ?? [],
      createdAt: row['created_at']
    }))
  }
}
