// Allows TypeScript to resolve CSS side-effect imports (e.g. import '@/styles/globals.css')
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
