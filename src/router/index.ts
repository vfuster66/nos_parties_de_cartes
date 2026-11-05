import { createRouter, createWebHashHistory } from 'vue-router'

export default createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: () => import('../views/HomeView.vue') },
    { path: '/nouvelle', component: () => import('../views/NewGameView.vue') },
    { path: '/historique', component: () => import('../views/HistoryView.vue') },
    { path: '/partie/:id', component: () => import('../views/GameView.vue'), props: true },
    { path: '/partie/:id/donne/:dealId?', component: () => import('../views/DealFormView.vue'), props: true },
    { path: '/partie/:id/detail/:dealId', component: () => import('../views/DealDetailView.vue'), props: true },
    { path: '/partie/:id/resultat', component: () => import('../views/ResultView.vue'), props: true },
    { path: '/soirees', component: () => import('../views/EveningsView.vue') },
    { path: '/soiree/:id', component: () => import('../views/EveningView.vue'), props: true },
    { path: '/joueurs', component: () => import('../views/PlayersView.vue') },
    { path: '/joueur/:id', component: () => import('../views/PlayerView.vue'), props: true },
    { path: '/equipes', component: () => import('../views/TeamsView.vue') },
    { path: '/equipe/:id', component: () => import('../views/TeamView.vue'), props: true },
    { path: '/classements', component: () => import('../views/RankingsView.vue') },
    { path: '/parametres', component: () => import('../views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
