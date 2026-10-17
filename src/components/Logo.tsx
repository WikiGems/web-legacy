export function Logo(props: { compact?: boolean }) {
  return (
    <a href="/" class="wg-brand" aria-label="WikiGems home">
      <span class="wg-brand-mark" aria-hidden="true">
        <span class="wg-brand-w">W</span>
        <span class="wg-brand-g">G</span>
      </span>
      {!props.compact && (
        <span class="wg-wordmark">
          <span>Wiki</span>Gems
        </span>
      )}
    </a>
  );
}
