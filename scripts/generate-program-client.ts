import { $ } from "bun";
import { rootNodeFromAnchor, type AnchorIdl } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { createFromRoot } from "codama";
import idl from "../programs/wikigems/idl/wikigems_program.json";

await createFromRoot(rootNodeFromAnchor(idl as AnchorIdl)).accept(
  renderVisitor("worker/chain/generated", {
    generatedFolder: ".",
    kitImportStrategy: "rootOnly",
    syncPackageJson: false,
    formatCode: false,
  }),
);

await $`bunx oxfmt worker/chain/generated`;
