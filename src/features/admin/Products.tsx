import { useState } from "react";
import { useAuth } from "../auth/context";
import { useWarehouse } from "../../hooks/useWarehouse";
import { operations } from "../../services/operations";
import { Feedback, SyncStatus } from "../../components/Status";
import { matchesProduct, parseCasePack } from "../../lib/workflow";
import type { Product } from "../../lib/operations";
export function Products() {
  const { profile } = useAuth();
  return profile?.role === "ADMIN" ? (
    <Catalog />
  ) : (
    <div className="error">
      Product administration requires an administrator.
    </div>
  );
}
function Catalog() {
  const state = useWarehouse(
    "products",
    operations.catalog,
    undefined,
    "products",
  );
  const [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Product | null | undefined>(undefined);
  return (
    <>
      <SyncStatus {...state} />
      <Feedback {...state} />
      <div className="page-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>Products</h1>
          <p>
            Names lead. Packaging and rows remain attached to each order’s
            snapshot.
          </p>
        </div>
        <button className="primary" onClick={() => setEditing(null)}>
          Add product
        </button>
      </div>
      {editing !== undefined && (
        <ProductEditor
          key={editing?.id ?? "new"}
          product={editing}
          rows={state.data?.rows.map((r) => r.id) ?? []}
          blocked={state.blocked}
          cancel={() => setEditing(undefined)}
          save={(p) =>
            void state.act(async () => {
              await operations.saveProduct(p);
              setEditing(undefined);
            }, "Product saved. Existing order snapshots unchanged.")
          }
        />
      )}
      <label>
        Search product name
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="catalog-list">
        {state.data?.products
          .filter((p) => matchesProduct(p.name, query))
          .map((p) => (
            <article className="panel" key={p.id}>
              <div>
                <h3>{p.name}</h3>
                <p>
                  {p.case_pack_display ?? "Pack not configured"} ·{" "}
                  {p.pick_row_id} · {p.active ? "Active" : "Inactive"}
                </p>
              </div>
              <button onClick={() => setEditing(p)}>Edit</button>
            </article>
          ))}
      </div>
    </>
  );
}
function ProductEditor({
  product,
  rows,
  blocked,
  cancel,
  save,
}: {
  product: Product | null;
  rows: string[];
  blocked: boolean;
  cancel: () => void;
  save: (
    p: Partial<Product> & {
      name: string;
      case_pack_display: string;
      pick_row_id: string;
      active: boolean;
    },
  ) => void;
}) {
  const [pack, setPack] = useState(product?.case_pack_display ?? ""),
    [error, setError] = useState("");
  let description = "Enter slash-separated packaging levels.";
  try {
    const p = parseCasePack(pack);
    description =
      p.levels.join(" × ") +
      " = " +
      p.units.toLocaleString() +
      " units per full case";
  } catch {
    /* Show validation on save. */
  }
  return (
    <form
      className="panel inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          parseCasePack(pack);
        } catch (err) {
          setError((err as Error).message);
          return;
        }
        const f = new FormData(e.currentTarget);
        save({
          ...product,
          name: String(f.get("name")).trim(),
          case_pack_display: pack,
          pick_row_id: String(f.get("row")),
          active: f.get("active") === "on",
        });
      }}
    >
      <h2>{product ? "Edit product" : "New product"}</h2>
      <label>
        Product name
        <input name="name" defaultValue={product?.name} required />
      </label>
      <label>
        Case pack
        <input
          value={pack}
          onChange={(e) => setPack(e.target.value)}
          placeholder="4/1 or 8/20/100"
          required
        />
      </label>
      <p>{description}</p>
      <label>
        Pick row
        <select
          name="row"
          defaultValue={product?.pick_row_id ?? rows[0]}
          required
        >
          {rows.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? true}
        />
        Active product
      </label>
      {error && <p className="error">{error}</p>}
      <div className="button-row">
        <button className="primary" disabled={blocked}>
          Save product
        </button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
