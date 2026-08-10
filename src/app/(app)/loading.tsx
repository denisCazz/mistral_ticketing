export default function Loading() {
  return (
    <div className="flex min-h-80 items-center justify-center p-8">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent"
        aria-label="Caricamento"
      />
    </div>
  );
}
