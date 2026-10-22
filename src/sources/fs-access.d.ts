// Minimal File System Access API typings (Chrome, Edge) that lib.dom doesn't have.
type FileSystemPermissionMode = 'read' | 'readwrite';

interface FileSystemHandle {
  queryPermission?(options?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
  requestPermission?(options?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

interface Window {
  showDirectoryPicker?(options?: { mode?: FileSystemPermissionMode; id?: string }): Promise<FileSystemDirectoryHandle>;
}
