# Pod Files Plugin

An OpenShift Console dynamic plugin that adds a **Files** tab to Pod resources, allowing you to browse, edit, download, upload, and manage files inside pod containers directly from the OpenShift Web Console.

## Features

- **File Browser** — Navigate directory trees inside pod containers
- **File Editor** — View and edit file contents with syntax highlighting
- **Upload/Download** — Upload files to and download files from containers
- **File Operations** — Create, rename, delete files and directories
- **Image Preview** — Preview image files directly in the console
- **Tail Viewer** — Tail log files in real-time
- **Permissions Management** — View and modify file permissions

## Tech Stack

- **TypeScript** / **React 17**
- **PatternFly 4** — UI component library
- **Webpack 5** — Module bundler
- **OpenShift Console Dynamic Plugin SDK** — Plugin framework

## Prerequisites

- Node.js 20+
- npm
- Access to an OpenShift cluster with the Web Console installed

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

Start the webpack dev server with hot reload:

```bash
npm start
```

The dev server runs on port `9001`.

### Build

Production build:

```bash
npm run build
```

Development build:

```bash
npm run build:dev
```

## Docker

Build the container image:

```bash
docker build -t pod-files-plugin:latest .
```

The image uses a multi-stage build:
1. **Build stage** — Node 20 Alpine to compile the plugin
2. **Runtime** — Nginx unprivileged (port 9001) with SSL support

## Deployment

The built plugin is served via Nginx with:
- SSL/TLS support (TLSv1.2/1.3)
- Long-term caching for static assets
- No-cache for the plugin manifest
- Health check endpoint at `/healthz`

Deploy to your OpenShift cluster and register the plugin using the `ConsolePlugin` custom resource pointing to the service.

## Project Structure

```
pod-files-plugin/
├── src/
│   ├── components/
│   │   ├── FilesTab.tsx          # Main tab component (entry point)
│   │   ├── FileExplorer.tsx      # Directory/file browser
│   │   ├── FileEditor.tsx        # File content editor
│   │   ├── FileIcon.tsx          # File type icons
│   │   ├── FileTailViewer.tsx    # Real-time log tailing
│   │   ├── CreateModal.tsx       # Create file/directory modal
│   │   ├── DeleteModal.tsx       # Delete confirmation modal
│   │   ├── RenameModal.tsx       # Rename modal
│   │   ├── UploadModal.tsx       # File upload modal
│   │   ├── PermissionsModal.tsx  # File permissions modal
│   │   ├── ImagePreviewModal.tsx # Image preview modal
│   │   └── PortalModal.tsx       # Portal wrapper for modals
│   ├── utils/
│   │   ├── exec.ts               # Container exec utilities
│   │   └── fileUtils.ts          # File operation helpers
│   └── index.ts                  # Plugin entry point
├── console-extensions.json       # OpenShift console extension definitions
├── webpack.config.js             # Webpack configuration
├── tsconfig.json                 # TypeScript configuration
├── Dockerfile                    # Container build definition
├── nginx.conf                    # Nginx server configuration
└── package.json
```

## Console Extension

The plugin registers a horizontal nav tab on the Pod resource:

```json
{
  "type": "console.tab/horizontalNav",
  "properties": {
    "model": { "group": "", "version": "v1", "kind": "Pod" },
    "page": { "name": "Files", "href": "files" },
    "component": { "$codeRef": "FilesTab.FilesTab" }
  }
}
```

## License

Private
