import { createApp } from 'vue'
// Design tokens + base page styles come from the shared component library
// so every Avalon client renders the same theme.
import '@avalon-initiative/common-ui/tokens.css'
import '@avalon-initiative/common-ui/global.css'
import '@avalon-initiative/common-ui/style.css'
import App from './App.vue'

createApp(App).mount('#app')
