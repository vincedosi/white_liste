const STYLES: Record<'calme' | 'vigilance' | 'tension', string> = {
  calme: 'bg-[#5C8B70]/15 text-[#5C8B70]',
  vigilance: 'bg-[#C28230]/15 text-[#C28230]',
  tension: 'bg-[#B44848]/15 text-[#B44848]',
};

export function Pill({
  variant,
  children,
}: {
  variant: 'calme' | 'vigilance' | 'tension';
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-[10px] font-medium ${STYLES[variant]}`}>
      {children}
    </span>
  );
}
