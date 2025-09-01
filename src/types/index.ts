export interface MarkdownFile {
  name: string;
  displayName: string;
  path: string;
  folder?: string;
}

export interface MarkdownFolder {
  name: string; // slug
  displayName: string; // derived nice name
  icon?: string;
  files: MarkdownFile[]; // direct files
  folders?: MarkdownFolder[]; // nested folders
  parentPath?: string; // accumulated parent path for building routes
  fullPath?: string; // full path from root (without /docs prefix)
}

export interface MarkdownStructure {
  rootFiles: MarkdownFile[]; // files at root /docs
  folders: MarkdownFolder[]; // top-level folders
}
