declare module 'file-saver' {
  export function saveAs(data: Blob | File, name?: string): void;
}
