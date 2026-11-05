import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useData } from './stores/data'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
void useData().load()
app.mount('#app')
