import {
  SiTypescript,
  SiJavascript,
  SiReact,
  SiRust,
  SiCss,
  SiHtml5,
} from "react-icons/si";
import {
  VscFile,
  VscFolder,
  VscFolderOpened,
  VscJson,
  VscMarkdown,
  VscSettingsGear,
  VscGear,
} from "react-icons/vsc";

interface FileIconProps {
  name: string;
  isDir: boolean;
  expanded?: boolean;
}

export function FileIcon({ name, isDir, expanded }: FileIconProps) {
  if (isDir) {
    return expanded ? (
      <VscFolderOpened className="text-[#e8a87c] shrink-0" />
    ) : (
      <VscFolder className="text-[#e8a87c] shrink-0" />
    );
  }

  const ext = name.split(".").pop()?.toLowerCase();
  const base = name.toLowerCase();

  switch (ext) {
    case "ts":
      return <SiTypescript className="text-[#3178c6] shrink-0" size={12} />;
    case "tsx":
      return <SiReact className="text-[#61dafb] shrink-0" size={12} />;
    case "js":
    case "jsx":
      return <SiJavascript className="text-[#f7df1e] shrink-0" size={12} />;
    case "rs":
      return <SiRust className="text-[#ce422b] shrink-0" size={14} />;
    case "json":
      return <VscJson className="text-[#f9e2af] shrink-0" />;
    case "css":
      return <SiCss className="text-[#264de4] shrink-0" size={12} />;
    case "html":
      return <SiHtml5 className="text-[#e34f26] shrink-0" size={12} />;
    case "md":
      return <VscMarkdown className="text-[#83bae8] shrink-0" />;
    case "toml":
    case "yaml":
    case "yml":
      return <VscSettingsGear className="text-[var(--text-muted)] shrink-0" />;
    default:
      break;
  }

  // Config files by name
  if (
    base.startsWith(".git") ||
    base.startsWith(".env") ||
    base === ".editorconfig" ||
    base === ".prettierrc"
  ) {
    return <VscGear className="text-[var(--text-muted)] shrink-0" />;
  }

  return <VscFile className="text-[var(--text-muted)] shrink-0" />;
}
