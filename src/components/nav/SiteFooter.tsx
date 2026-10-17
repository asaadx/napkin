export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-2 px-4 py-6 text-[12.5px] text-fg-3 sm:px-6">
        <p>Napkin · Open source (MIT)</p>
        <a
          href="https://github.com/asaadx/napkin"
          target="_blank"
          rel="noreferrer"
          className="rounded transition-colors duration-150 outline-none hover:text-fg focus-visible:text-fg focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
