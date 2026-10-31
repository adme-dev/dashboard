export default {
  async fetch(request) {
    const url = new URL(request.url)
    if (url.origin === 'https://motorstackmedia.driveagent.io' && url.pathname === '/ford/images/ranger/hero.png') {
      if (request.headers.has('Authorization')) throw new Error('Credential sent to media CDN')
      return new Response(new Uint8Array([137,80,78,71]), { headers: { 'Content-Type': 'image/png' } })
    }
    if (url.origin !== 'https://oem-variants.pages.dev') throw new Error('Unexpected provider host')
    if (request.headers.get('Authorization') !== 'Bearer msk_test_fixture_only_0123456789') throw new Error('Missing fixture authorization')
    if (url.pathname === '/api/mcp') {
      const {params} = await request.json()
      if (params.name === 'list_oems') return Response.json({result:{structuredContent:{oems:[{oem:'ford',name:'Ford Australia'}]}}})
      if (params.name === 'get_media_library' && params.arguments.oem === 'ford') return Response.json({result:{structuredContent:{models:[{model:'Ranger',heroImage:'https://motorstackmedia.driveagent.io/ford/images/ranger/hero.png',colours:[]}]}}})
      if (params.name === 'get_variants' && params.arguments.oem === 'ford') return Response.json({result:{structuredContent:{vehicles:[]}}})
      if (params.name !== 'get_brand_assets' || params.arguments.oem !== 'ford') throw new Error('Unexpected provider method')
      return Response.json({result:{structuredContent:{oem:'ford',fonts:{heading:{family:'FordBold',weight:700,file:'FordBold-400.woff2',url:'https://oem-variants.pages.dev/api/fonts/ford/FordBold-400.woff2'}},logos:[],colours:{primaryColor:'#066fef'}}}})
    }
    if (url.pathname === '/api/fonts/ford/FordBold-400.woff2') return new Response(new Uint8Array([119,79,70,50]),{headers:{'Content-Type':'font/woff2'}})
    throw new Error('Unexpected outbound fetch')
  }
}
