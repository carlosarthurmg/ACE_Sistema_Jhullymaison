import { createRouter, createWebHistory } from "vue-router";

// Arquivo COMPARTILHADO: cada pessoa adiciona só as rotas do seu módulo,
// em um bloco próprio, e avisa o grupo antes de editar.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/views/public/HomeView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/public/NotFoundView.vue"),
    },
  ],
});

export default router;
