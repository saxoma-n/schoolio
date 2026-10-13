import { useRef, type ComponentProps } from 'react'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import type { UiMessage } from './useChat'

function CodeBlock(props: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  return (
    <div className="code-block">
      <button type="button" className="copy" onClick={() => navigator.clipboard.writeText(ref.current?.textContent ?? '')}>Copy</button>
      <pre ref={ref}>{props.children}</pre>
    </div>
  )
}

export function MessageItem({ message, onRetrySave }: { message: Pick<UiMessage, 'role' | 'content' | 'status' | 'saveFailed'>; onRetrySave?(): void }) {
  return (
    <article className={`message ${message.role}`}>
      <div className="content">
        {message.role === 'user' ? (
          <p className="plain">{message.content}</p>
        ) : (
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ pre: CodeBlock }}>
            {message.content}
          </Markdown>
        )}
      </div>
      {message.status === 'incomplete' && <span className="badge">Incomplete</span>}
      {message.saveFailed && <button type="button" className="link" onClick={onRetrySave}>Not saved — retry</button>}
    </article>
  )
}
