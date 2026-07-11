export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-3 py-4">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </div>
  );
}
