export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function statusLabel(status) {
  switch (status) {
    case "LIVE":
      return "Live";

    case "DEMONSTRABLE":
      return "Demo available";

    case "INTERNAL_DEMO":
      return "Internal demo";

    case "NOT_DEMONSTRABLE":
      return "Not yet demonstrable";

    default:
      return null;
  }
}

export function statusClass(status) {
  switch (status) {
    case "LIVE":
      return "status-live";

    case "DEMONSTRABLE":
      return "status-demo";

    case "INTERNAL_DEMO":
      return "status-internal";

    default:
      return "status-development";
  }
}

/*
 * One reusable Product tile.
 *
 * The component consumes presentation-ready governed projection data.
 * It does not infer missing Product facts and does not expose Core
 * implementation detail to the public interface.
 */
export function renderCatalogueTile(item) {
  const esc = escapeHtml;

  const status =
    statusLabel(item.demonstrationStatus);

  const canOpen =
    item.demonstrationStatus === "LIVE" &&
    Boolean(item.demonstrationUrl);

  const selectedClass =
    item.selected
      ? " product-card-selected"
      : "";

  const action =
    canOpen
      ? `
        <a
          class="card-action"
          href="${esc(item.demonstrationUrl)}"
        >
          Open ${esc(item.displayName)}
          <span aria-hidden="true">&#8594;</span>
        </a>`
      : "";

  return `
    <article
      class="product-card${selectedClass}"
      data-product-card
      data-name="${esc(item.displayName)}"
      data-type="${esc(item.category)}"
      data-newest="${esc(item.newest)}"
    >
      <div class="card-top">
        <img
          class="product-icon"
          src="${esc(item.icon)}"
          alt=""
          width="44"
          height="44"
        >

        ${
          status
            ? `<span class="status ${statusClass(item.demonstrationStatus)}">${esc(status)}</span>`
            : ""
        }
      </div>

      <p class="product-type">${esc(item.category)}</p>

      <h3>${esc(item.displayName)}</h3>

      <p class="product-summary">
        ${esc(item.publicSummary)}
      </p>

      ${action}
    </article>`;
}
