declare module '@zero-experiment/libheif' {
  const build: () => import('./contracts.ts').HeifModule | Promise<import('./contracts.ts').HeifModule>;
  export default build;
}
