<template>
  <main class="mx-auto max-w-5xl p-6">
    <nav aria-label="Administração" class="flex flex-wrap gap-6 border-b pb-4">
      <RouterLink to="/admin/pedidos">Pedidos</RouterLink>
      <RouterLink to="/admin/clientes">Clientes</RouterLink>
      <RouterLink to="/admin/relatorios">Relatórios</RouterLink>
    </nav>
    <RouterView :key="$route.path" />
  </main>
</template>
<style scoped>
main :deep(h1) {
  font:
    bold 2rem Georgia,
    serif;
  margin: 1.5rem 0;
}
main :deep(h2) {
  font-weight: bold;
  margin: 1rem 0 0.5rem;
}
main :deep(a) {
  text-decoration: underline;
}
main :deep(form),
main :deep(.actions) {
  display: flex;
  gap: 0.75rem;
  align-items: end;
  flex-wrap: wrap;
  margin: 1rem 0;
}
main :deep(label) {
  display: grid;
  gap: 0.2rem;
}
main :deep(button),
main :deep(select),
main :deep(input) {
  border: 1px solid;
  padding: 0.45rem 0.75rem;
  border-radius: 0.3rem;
  min-height: 44px;
}
main :deep(button:disabled) {
  opacity: 0.5;
}
main :deep(li) {
  padding: 0.65rem 0;
  border-bottom: 1px solid #ccc;
}
main :deep(a) {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
main :deep([role="alert"]) {
  color: #852215;
}
</style>
