import { Fragment } from "react";
// A deliberately small renderer: never interprets HTML, links, scripts or model-provided components.
export function AssistantAnswer({ text }: { text: string }) {
  return (
    <div className="astra-answer">
      {text.split(/\n{2,}/).map((block, i) => (
        <p key={i}>
          {block
            .split(/(\*\*[^*\n]+\*\*)/g)
            .map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : (
                <Fragment key={j}>{part.replace(/^#{1,3}\s/gm, "")}</Fragment>
              ),
            )}
        </p>
      ))}
    </div>
  );
}
