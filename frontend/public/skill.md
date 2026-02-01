# Vincent Skill — Key Minting (Draft)

> **Onboarding prompt (recommended):**
> Read https://heyvincent.ai/skill.md and follow the instructions to create a key.

## What this skill does
Vincent is Agent Security for money-moving LLMs. Agents get **capabilities** (scoped keys) and can execute actions without ever seeing the underlying secret.

## Create a key
1) Create a new capability key (EVM wallet):

```bash
curl -X POST https://heyvincent.ai/api/secrets \
  -H "Content-Type: application/json" \
  -d '{"type":"evm_wallet"}'
```

2) Save the response:
- `api_key` (shown once)
- `claim_url` (send to a human/admin)
- `smart_account_address`

3) Use the key to execute actions:
- transfer
- contract call

## Human claim + governance
A human can claim the secret, set policies (limits/allowlists/selectors), and enable Telegram approvals.

## Notes
- Keys are scoped + revocable.
- Every attempt produces a receipt (audit log): allowed / denied / approved.
