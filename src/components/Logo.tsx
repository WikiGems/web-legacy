export function Logo(props: { compact?: boolean }) {
  return (
    <a href="/" class="wm-brand" aria-label="WikiMasters home">
      <span class="wm-brand-mark" aria-hidden="true">
        <span class="wm-brand-w">W</span>
        <span class="wm-brand-m">M</span>
      </span>
      {!props.compact && (
        <span class="wm-wordmark">
          <span>Wiki</span>Masters
        </span>
      )}
    </a>
  );
}
