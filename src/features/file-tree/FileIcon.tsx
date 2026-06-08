import {
  SiTypescript,
  SiJavascript,
  SiReact,
  SiRust,
  SiCss,
  SiHtml5,
  SiPython,
  SiGo,
  SiDocker,
  SiSass,
  SiSvelte,
  SiVuedotjs,
  SiAngular,
  SiSwift,
  SiKotlin,
  SiDart,
  SiLua,
  SiGnubash,
  SiCplusplus,
  SiScala,
  SiGraphql,
  SiPrisma,
  SiPhp,
  SiRuby,
  SiSharp,
} from "react-icons/si";
import {
  VscFile,
  VscFolder,
  VscFolderOpened,
  VscJson,
  VscMarkdown,
  VscSettingsGear,
  VscGear,
  VscFileMedia,
  VscFilePdf,
  VscDatabase,
  VscLock,
  VscTerminal,
  VscFileCode,
} from "react-icons/vsc";
import { FaJava } from "react-icons/fa";

const ICON_SM = 12;
const ICON_MD = 14;

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

  // Extension-based icons
  const icon = getIconByExtension(ext);
  if (icon) return icon;

  // Name-based icons
  const namedIcon = getIconByName(base);
  if (namedIcon) return namedIcon;

  return <VscFile className="text-muted shrink-0" />;
}

function getIconByExtension(ext: string | undefined) {
  switch (ext) {
    // Web — JS/TS
    case "ts":
      return <SiTypescript className="text-[#3178c6] shrink-0" size={ICON_SM} />;
    case "tsx":
    case "jsx":
      return <SiReact className="text-[#61dafb] shrink-0" size={ICON_SM} />;
    case "js":
    case "mjs":
    case "cjs":
      return <SiJavascript className="text-[#f7df1e] shrink-0" size={ICON_SM} />;

    // Web — Markup & Style
    case "html":
    case "htm":
      return <SiHtml5 className="text-[#e34f26] shrink-0" size={ICON_SM} />;
    case "css":
      return <SiCss className="text-[#264de4] shrink-0" size={ICON_SM} />;
    case "scss":
    case "sass":
      return <SiSass className="text-[#cc6699] shrink-0" size={ICON_SM} />;
    case "graphql":
    case "gql":
      return <SiGraphql className="text-[#e10098] shrink-0" size={ICON_SM} />;

    // Web — Frameworks
    case "svelte":
      return <SiSvelte className="text-[#ff3e00] shrink-0" size={ICON_SM} />;
    case "vue":
      return <SiVuedotjs className="text-[#4fc08d] shrink-0" size={ICON_SM} />;

    // Systems
    case "rs":
      return <SiRust className="text-[#ce422b] shrink-0" size={ICON_MD} />;
    case "go":
      return <SiGo className="text-[#00add8] shrink-0" size={ICON_MD} />;
    case "c":
    case "h":
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
      return <SiCplusplus className="text-[#00599c] shrink-0" size={ICON_SM} />;
    case "cs":
      return <SiSharp className="text-[#68217a] shrink-0" size={ICON_SM} />;
    case "swift":
      return <SiSwift className="text-[#f05138] shrink-0" size={ICON_SM} />;

    // JVM
    case "java":
    case "jar":
      return <FaJava className="text-[#ed8b00] shrink-0" size={ICON_MD} />;
    case "kt":
    case "kts":
      return <SiKotlin className="text-[#7f52ff] shrink-0" size={ICON_SM} />;
    case "scala":
      return <SiScala className="text-[#dc322f] shrink-0" size={ICON_SM} />;

    // Scripting
    case "py":
    case "pyw":
    case "pyi":
      return <SiPython className="text-[#3776ab] shrink-0" size={ICON_SM} />;
    case "rb":
    case "gemspec":
      return <SiRuby className="text-[#cc342d] shrink-0" size={ICON_SM} />;
    case "php":
      return <SiPhp className="text-[#777bb4] shrink-0" size={ICON_MD} />;
    case "lua":
      return <SiLua className="text-[#2c2d72] shrink-0" size={ICON_SM} />;
    case "dart":
      return <SiDart className="text-[#0175c2] shrink-0" size={ICON_SM} />;
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return <SiGnubash className="text-[#4eaa25] shrink-0" size={ICON_SM} />;

    // Data / Config
    case "json":
    case "jsonc":
    case "json5":
      return <VscJson className="text-[#f9e2af] shrink-0" />;
    case "md":
    case "mdx":
      return <VscMarkdown className="text-[#83bae8] shrink-0" />;
    case "toml":
    case "yaml":
    case "yml":
    case "ini":
    case "cfg":
    case "conf":
      return <VscSettingsGear className="text-muted shrink-0" />;
    case "sql":
    case "sqlite":
    case "db":
      return <VscDatabase className="text-[#f9e2af] shrink-0" />;
    case "prisma":
      return <SiPrisma className="text-[#2d3748] shrink-0" size={ICON_SM} />;

    // Images
    case "svg":
      return <VscFileCode className="text-[#ffb13b] shrink-0" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
    case "bmp":
    case "avif":
      return <VscFileMedia className="text-[#a6e3a1] shrink-0" />;

    // Documents
    case "pdf":
      return <VscFilePdf className="text-[#f38ba8] shrink-0" />;

    // Lock files
    case "lock":
      return <VscLock className="text-muted shrink-0" />;

    default:
      return null;
  }
}

function getIconByName(base: string) {
  // Dockerfiles
  if (base === "dockerfile" || base.startsWith("dockerfile.")) {
    return <SiDocker className="text-[#2496ed] shrink-0" size={ICON_MD} />;
  }

  // Shell scripts / terminal configs
  if (
    base === "makefile" ||
    base === "justfile" ||
    base === "procfile"
  ) {
    return <VscTerminal className="text-muted shrink-0" />;
  }

  // Angular component detection
  if (base.endsWith(".component.ts") || base.endsWith(".module.ts")) {
    return <SiAngular className="text-[#dd0031] shrink-0" size={ICON_SM} />;
  }

  // Config / dotfiles
  if (
    base.startsWith(".git") ||
    base.startsWith(".env") ||
    base === ".editorconfig" ||
    base === ".prettierrc" ||
    base === ".eslintrc" ||
    base === ".browserslistrc" ||
    base === ".npmrc" ||
    base === ".nvmrc" ||
    base === "tsconfig.json" ||
    base === "vite.config.ts" ||
    base === "webpack.config.js" ||
    base === "tailwind.config.js" ||
    base === "tailwind.config.ts"
  ) {
    return <VscGear className="text-muted shrink-0" />;
  }

  return null;
}
