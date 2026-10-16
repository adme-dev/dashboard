/** Standalone native Worker verification boundary. Native parses the returned
 * value with its wire schema; the shared planner supplies semantic verification. */
export declare function verifyManagedTransferCopyContext(
  input: unknown
): Promise<unknown>;
export declare function verifyManagedTransferCopyGraphProof(
  input: unknown,
  context: unknown
): Promise<unknown>;
export declare function verifyManagedTransferCopyGraphStatus(
  input: unknown,
  context: unknown
): Promise<unknown>;
export declare function planNativeManagedTransferCopyGraph(
  context: unknown
): Promise<unknown>;
