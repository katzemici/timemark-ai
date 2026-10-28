import { Editor } from "@/components/editor";

/**
 * The whole app is a single client-side editor. Rendering it from a Server
 * Component keeps the static shell prerendered while all interactivity
 * (video, FFmpeg) lives in client components.
 */
export default function Home() {
  return <Editor />;
}
