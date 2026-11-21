import { createRouter, createWebHistory } from "vue-router";
import { catalogRoutes } from "./catalog.routes";

// Arquivo COMPARTILHADO: cada pessoa adiciona só as rotas do seu módulo,
// em um bloco próprio, e avisa o grupo antes de editar.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Catálogo (Rodolfo): /, /catalogo, /produto/:slug, /sobre, /admin/produtos*, /admin/categorias
    ...catalogRoutes,
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/public/NotFoundView.vue"),
    },
  ],
});

export default router;
