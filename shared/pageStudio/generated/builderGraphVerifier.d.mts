export interface AstroCompilerBuildIdentity {
  buildId: string;
  identity: {
    formatVersion: 1;
    renderer: "astro";
    scope: {
      tenantId: string;
      clientId: string;
      siteId: string;
    };
    environment: "staging" | "production";
    source:
      | {
          kind: "checkpoint";
          checkpointId: string;
          checkpointDigest: string;
        }
      | {
          kind: "approved-version";
          versionId: string;
          versionDigest: string;
          checkpoint: {
            id: string;
            digest: string;
          } | null;
        };
    renderInputDigest: string;
    featureRecoveryDigest: string | null;
    toolchainDigest: string;
  };
  identityDigest: string;
}
/** Addressing only; native trusted configuration must select and retain the
 * deployed toolchain. Neither this helper nor a self-consistent pin grants access. */
export declare function createAstroCompilerBuildIdentity(
  input: unknown,
  admittedToolchain: unknown
): Promise<AstroCompilerBuildIdentity>;
/** Recompute retained pins before native reuse. Approval, current entitlement
 * and actual compiler host provenance remain independent authority checks. */
export declare function verifyAstroCompilerBuildIdentity(
  candidate: unknown,
  admittedToolchain: unknown
): Promise<AstroCompilerBuildIdentity>;
export interface BuilderGraphPin {
  id: string;
  kind: "collection" | "component" | "action";
  sha256: string;
  version: number;
}
export interface BuilderGraphStoragePin {
  bytes: number;
  collectionId: string;
  freezeDigest: string;
  kind: "content" | "schema" | "record";
  operationId: string;
  origin: "legacy" | "prepared";
  recordId: string;
  sha256: string;
  version: number;
}
export interface BuilderGraphSchemaSelection {
  artifact: BuilderGraphPin;
  objectId: string | null;
  storage: BuilderGraphStoragePin;
}
export interface BuilderGraphProof {
  actions: BuilderGraphPin[];
  candidateDigest: string | null;
  components: BuilderGraphPin[];
  expectedApplication: {
    id: string;
    digest: string;
  };
  expectedCheckpoint: {
    id: string;
    digest: string;
  };
  expectedContent: BuilderGraphStoragePin | null;
  nextCheckpoint: {
    id: string;
    digest: string;
  };
  proofDigest: string;
  proposalDigest: string | null;
  requestDigest: string;
  schemas: BuilderGraphSchemaSelection[];
  version: 1;
}
export interface BuilderGraphArtifactInput {
  artifactBytes: string[];
  proposalBytes: string;
  scope: unknown;
}
export interface BuilderGraphTransitionInput {
  artifactBytes: string[];
  base: unknown;
  candidateBytes: string;
  expectedRuntimeDigest: string;
  nextCheckpoint: unknown;
  preparations: unknown;
  request: unknown;
}
export interface BuilderGraphCheckpointInput {
  artifactBytes: string[];
  base: unknown;
  nextCheckpoint: unknown;
  request: unknown;
}
export interface BuilderGraphArtifactProof {
  digest: string;
  pins: BuilderGraphPin[];
}
export declare class BuilderGraphVerificationError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}
/** Pure integrity verification. Scope and pins never establish acceptance. */
export declare function verifyBuilderArtifactSet(
  input: BuilderGraphArtifactInput
): Promise<BuilderGraphArtifactProof>;
/** Pure page save/restore proof: preserves the CURRENT graph and all record heads.
 * Native must still recheck current authority and every base under its locks. */
export declare function verifyBuilderApplicationCheckpoint(
  input: BuilderGraphCheckpointInput
): Promise<BuilderGraphProof>;
/** No I/O or grants. HOST configuration supplies expectedRuntimeDigest separately
 * from the candidate; native acceptance remains an independent transaction. */
export declare function verifyBuilderApplicationTransition(
  input: BuilderGraphTransitionInput
): Promise<BuilderGraphProof>;
export type BuilderGraphJson =
  | null
  | boolean
  | number
  | string
  | BuilderGraphJson[]
  | {
      [property: string]: BuilderGraphJson;
    };
export interface BuilderGraphReadBinding {
  collection: BuilderGraphPin;
  fields: string[];
  id: string;
  limit: number;
}
export interface BuilderGraphEffectDeclaration {
  maxCommands: number;
  permissions: {
    collection: BuilderGraphPin;
    fields: string[];
    operations: ("create" | "update" | "archive")[];
  }[];
  version: 1;
}
export interface BuilderGraphActionInput {
  actionPin: unknown;
  artifactBytes: string;
  input: unknown;
  scope: unknown;
}
export interface BuilderGraphActionInputProof {
  action: BuilderGraphPin;
  collections: BuilderGraphReadBinding[];
  effects: BuilderGraphEffectDeclaration | null;
  formatVersion: 1 | 2;
  input: BuilderGraphJson;
}
export interface BuilderGraphActionResultInput {
  actionPin: unknown;
  artifactBytes: string;
  context: unknown;
  resultBytes: string;
  scope: unknown;
}
export interface BuilderGraphActionResult {
  commands: {
    type: "create" | "update" | "archive";
    collectionId: string;
    recordId: string;
    expectedRevision: number;
    schemaVersion: number;
    archived: boolean;
    values: Record<string, string | number | boolean>;
  }[];
  result: BuilderGraphJson;
  version: 1;
}
/** Input validation only. Native admission supplies independently accepted pins. */
export declare function verifyBuilderActionInput(
  input: BuilderGraphActionInput
): Promise<BuilderGraphActionInputProof>;
export interface BuilderPublishedFormInputProof
  extends BuilderGraphActionInputProof {
  bindingDigest: string;
  formDigest: string;
  formId: string;
}
/** Pure validation of sealed public form input. Native must independently admit
 * the current publication, challenge, intent and quota before any execution. */
export declare function verifyBuilderPublishedFormInput(input: {
  scope: unknown;
  actionPin: unknown;
  artifactBytes: string;
  form: unknown;
  fields: unknown;
}): Promise<BuilderPublishedFormInputProof>;
/** Normalized record values remain private host data, never guest/browser output. */
export declare function verifyBuilderActionResult(
  input: BuilderGraphActionResultInput
): Promise<BuilderGraphActionResult>;
export interface BuilderGraphProjectionInput {
  currentDefinition: unknown;
  fields: string[];
  pinnedDefinition: unknown;
  storedDefinition: unknown;
  values: unknown;
}
/** Public-field projection only; native proves accepted schema/record ownership. */
export declare function projectBuilderActionRecord(
  input: BuilderGraphProjectionInput
): Record<string, string | number | boolean>;
export declare function parseBuilderActionRuntimeResultJson(
  raw: string
): BuilderGraphJson;
/** Shared artifact transport parser; does not apply the smaller execution-output budget. */
export declare function parseBuilderArtifactJson(raw: string): BuilderGraphJson;
export interface BuilderFormActionDescriptor {
  inputContract: {
    version: 1;
    properties: (
      | {
          key: string;
          required: boolean;
          type: "string";
          enum?: string[];
          maxLength?: number;
        }
      | {
          key: string;
          required: boolean;
          type: "number";
          min?: number;
          max?: number;
        }
      | {
          key: string;
          required: boolean;
          type: "boolean";
        }
    )[];
  };
  label: string;
  pin: BuilderGraphPin;
}
/** Editor metadata only. Native must resolve the pin from current accepted selections. */
export declare function verifyBuilderFormActionDescriptor(input: {
  scope: unknown;
  actionPin: unknown;
  artifactBytes: string;
}): Promise<BuilderFormActionDescriptor | null>;
export interface BuilderActionEffectTargets {
  result: BuilderGraphJson;
  targets: {
    collectionId: string;
    recordId: string;
    expectedRevision: number;
    type: "create" | "update" | "archive";
  }[];
}
/** Bounded target discovery before native reads. This does not approve effects;
 * callers must still validate the complete plan against accepted record bases. */
export declare function inspectBuilderActionEffectTargets(input: {
  scope: unknown;
  actionPin: unknown;
  artifactBytes: string;
  resultBytes: string;
}): Promise<BuilderActionEffectTargets>;
/** Validate exact component collection pins and public fields before loading records.
 * Native supplies accepted definitions and separately proves current visibility. */
export declare function verifyBuilderComponentDataBindings(input: {
  scope: unknown;
  componentPin: unknown;
  artifactBytes: string;
  definitionBytes: string[];
}): Promise<{
  pin: BuilderGraphPin;
  bindings: BuilderGraphReadBinding[];
}>;
export interface BuilderGraphReleaseRecoveryProof {
  bundle: BuilderGraphJson;
  checkpoint: BuilderGraphJson;
  digest: string;
  forms: {
    action: BuilderGraphPin;
    bindingDigest: string;
    formDigest: string;
    formId: string;
    pageId: string;
    publicCreateEligible: boolean;
  }[];
  instances: {
    pageId: string;
    rootId: string;
    pin: BuilderGraphPin;
  }[];
}
/** Single-source release byte proof. Does not grant native publication authority. */
export declare function verifyBuilderReleaseRecovery(
  raw: unknown
): Promise<BuilderGraphReleaseRecoveryProof>;
