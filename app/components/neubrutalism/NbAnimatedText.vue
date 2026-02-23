<template>
  <div class="nb-animated-text">
    <span class="nb-animated-text-static">{{ prefix }}</span>
    <span class="nb-animated-text-words">
      <span 
        v-for="(word, index) in words" 
        :key="word"
        class="nb-animated-word"
        :class="{ 'is-active': currentIndex === index }"
      >
        {{ word }}
      </span>
    </span>
    <span class="nb-animated-text-static">{{ suffix }}</span>
    <span class="nb-animated-cursor" :class="{ 'is-blinking': !isTyping }">|</span>
  </div>
</template>

<script setup lang="ts">
interface Props {
  words: string[]
  prefix?: string
  suffix?: string
  typingSpeed?: number
  deleteSpeed?: number
  pauseDuration?: number
}

const props = withDefaults(defineProps<Props>(), {
  prefix: '',
  suffix: '',
  typingSpeed: 100,
  deleteSpeed: 50,
  pauseDuration: 2000
})

const currentIndex = ref(0)
const isTyping = ref(false)
const displayText = ref('')

let timeoutId: NodeJS.Timeout | null = null

function sleep(ms: number) {
  return new Promise(resolve => {
    timeoutId = setTimeout(resolve, ms)
  })
}

async function typeWord(word: string) {
  isTyping.value = true
  for (let i = 0; i <= word.length; i++) {
    displayText.value = word.slice(0, i)
    await sleep(props.typingSpeed)
  }
  isTyping.value = false
}

async function deleteWord(word: string) {
  isTyping.value = true
  for (let i = word.length; i >= 0; i--) {
    displayText.value = word.slice(0, i)
    await sleep(props.deleteSpeed)
  }
  isTyping.value = false
}

async function animate() {
  while (true) {
    const word = props.words[currentIndex.value]
    await typeWord(word)
    await sleep(props.pauseDuration)
    await deleteWord(word)
    currentIndex.value = (currentIndex.value + 1) % props.words.length
  }
}

onMounted(() => {
  animate()
})

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId)
})
</script>

<style scoped>
.nb-animated-text {
  display: inline;
  font: inherit;
  color: inherit;
}

.nb-animated-text-static {
  color: var(--nb-text-primary);
}

.nb-animated-text-words {
  position: relative;
  display: inline;
}

.nb-animated-word {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.3s ease;
  color: var(--nb-accent-red);
  font-weight: inherit;
}

.nb-animated-word.is-active {
  opacity: 1;
  transform: translateY(0);
  position: relative;
}

.nb-animated-cursor {
  color: var(--nb-accent-red);
  font-weight: 300;
  margin-left: 2px;
  animation: blink 1s step-end infinite;
}

.nb-animated-cursor.is-blinking {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
