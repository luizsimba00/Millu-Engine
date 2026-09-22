// Vercel executa este script em todo build. Preview não deve alterar o banco de produção.
if (process.env.VERCEL_ENV !== 'production') {
  console.log(`Migration ignorada no ambiente ${process.env.VERCEL_ENV ?? 'local'}.`);
} else {
  await import('./migrate.js');
}
