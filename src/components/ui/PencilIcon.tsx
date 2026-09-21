/** 編集ボタン用の鉛筆。アイコンライブラリを入れないのでインライン SVG で持つ。 */
export function PencilIcon({
  className = "h-3.5 w-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
    </svg>
  );
}
