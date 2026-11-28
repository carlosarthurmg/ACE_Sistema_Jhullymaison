import { createRouter, createWebHistory } from "vue-router";

// Arquivo COMPARTILHADO: cada pessoa adiciona só as rotas do seu módulo,
// em um bloco próprio, e avisa o grupo antes de editar.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/meus-pedidos/:id?", component: () => import("@/views/customer/CustomerOrders.vue") },
    {
      path: "/admin",
      component: () => import("@/views/admin/AdminLayout.vue"),
      children: [
        { path: "", redirect: "/admin/pedidos" },
        { path: "pedidos", component: () => import("@/views/admin/AdminOrders.vue") },
        { path: "pedidos/:id", component: () => import("@/views/admin/AdminOrderDetail.vue") },
        { path: "clientes", component: () => import("@/views/admin/AdminCustomers.vue") },
        { path: "clientes/:id", component: () => import("@/views/admin/AdminCustomers.vue") },
        { path: "relatorios", component: () => import("@/views/admin/AdminReports.vue") },
      ],
    },
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
