export function Logo(props: { compact?: boolean }) {
  return (
    <a href="/" class="wg-brand" aria-label="WikiGems home">
      <img class="wg-brand-mark" src="/gem.png" alt="" aria-hidden="true" />
      {!props.compact && (
        <span class="wg-wordmark">
          <span>Wiki</span>Gems
        </span>
      )}
    </a>
  );
}
