import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 大会概要の Markdown を表示する。フォームのプレビューと詳細ページで共用。
 * 生 HTML は react-markdown の既定で無効のため XSS 安全(rehype-raw を足さないこと)。
 */
export function TournamentDescriptionMarkdown({
  markdown,
}: {
  markdown: string;
}) {
  return (
    <div className="text-sm leading-relaxed text-slate-800">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h1
              className="mt-4 mb-2 text-lg font-bold first:mt-0"
              {...props}
            />
          ),
          h2: (props) => (
            <h2
              className="mt-4 mb-2 text-base font-bold first:mt-0"
              {...props}
            />
          ),
          h3: (props) => (
            <h3 className="mt-3 mb-1 font-bold first:mt-0" {...props} />
          ),
          p: (props) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
          ul: (props) => (
            <ul className="my-2 list-disc space-y-1 pl-5" {...props} />
          ),
          ol: (props) => (
            <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />
          ),
          a: (props) => (
            <a className="text-blue-600 underline" {...props} />
          ),
          code: (props) => (
            <code
              className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs"
              {...props}
            />
          ),
          pre: (props) => (
            <pre
              className="my-2 overflow-x-auto rounded bg-slate-100 p-3"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="my-2 border-l-4 border-slate-300 pl-3 text-slate-600"
              {...props}
            />
          ),
          table: (props) => (
            <div className="my-2 overflow-x-auto">
              <table className="border-collapse" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-medium"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border border-slate-300 px-2 py-1" {...props} />
          ),
          hr: (props) => <hr className="my-4 border-slate-200" {...props} />,
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
