/** Poll until the balance getter returns >= minAmount, with retries and delay */
export async function waitForBalance(
  getter: () => Promise<string>,
  minAmount: string,
  { retries = 15, delayMs = 2000 } = {}
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    const balance = await getter();
    if (parseFloat(balance) >= parseFloat(minAmount)) {
      return balance;
    }
    console.log(`  Waiting for balance (attempt ${i + 1}/${retries}): ${balance} < ${minAmount}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // Return last balance even if below threshold (test assertion will catch it)
  return getter();
}
