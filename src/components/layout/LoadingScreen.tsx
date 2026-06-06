interface LoadingScreenProps {
  label?: string;
}

export default function LoadingScreen({ label = 'טוען...' }: LoadingScreenProps) {
  return (
    <div dir="rtl" className="app-shell flex items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
