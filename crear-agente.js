import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { appendFileSync } from "node:fs";

const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const PRESUPUESTO = "0.05"; // lo único que el agente puede gastar
const COMPRA_USDC = "0.06"; // 0.05 para el agente + 0.01 de colchón en tu cuenta

if (process.env.AGENTE_SECRETA) {
  console.log("El agente ya tiene wallet en .env.");
  process.exit(0);
}

async function enviar(keypair, operaciones, texto) {
  const cuenta = await horizon.loadAccount(keypair.publicKey());
  const tx = new TransactionBuilder(cuenta, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });
  for (const op of operaciones) tx.addOperation(op);
  const construida = tx.setTimeout(60).build();
  construida.sign(keypair);
  const res = await horizon.submitTransaction(construida);
  console.log(`${texto}: ${res.hash}`);
  return res;
}

function saldoUSDC(cuenta) {
  const b = cuenta.balances.find(
    (x) => x.asset_type === "credit_alphanum4" && x.asset_code === "USDC" &&
      x.asset_issuer === USDC.issuer,
  );
  return b ? Number(b.balance) : 0;
}

// 1. Wallet nueva solo para el agente: XLM de Friendbot y trustline de USDC
const agente = Keypair.random();
const r = await fetch(`https://friendbot.stellar.org?addr=${agente.publicKey()}`);
if (!r.ok) throw new Error(`Friendbot falló: ${r.status}`);
console.log(`Friendbot fondeó ${agente.publicKey()}`);
await enviar(agente, [Operation.changeTrust({ asset: USDC })], "Trustline USDC del agente creada");

// 2. Tu cuenta necesita USDC. Si no tiene, los compra en el DEX con XLM de testnet.
const yo = Keypair.fromSecret(process.env.MI_SECRETA);
let cuentaYo = await horizon.loadAccount(yo.publicKey());
if (saldoUSDC(cuentaYo) === 0) {
  await enviar(yo, [Operation.changeTrust({ asset: USDC })], "Tu trustline USDC creada");
}
cuentaYo = await horizon.loadAccount(yo.publicKey());
if (saldoUSDC(cuentaYo) < Number(COMPRA_USDC)) {
  await enviar(
    yo,
    [Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: "2",
      destination: yo.publicKey(),
      destAsset: USDC,
      destAmount: COMPRA_USDC,
      path: [],
    })],
    `Comprados ${COMPRA_USDC} USDC en el DEX`,
  );
}

// 3. Tu cuenta le pasa un presupuesto chico de USDC al agente
const res = await enviar(
  yo,
  [Operation.payment({ destination: agente.publicKey(), asset: USDC, amount: PRESUPUESTO })],
  `Presupuesto enviado al agente`,
);

appendFileSync(".env", `\nAGENTE_PUBLICA=${agente.publicKey()}\nAGENTE_SECRETA=${agente.secret()}\n`);
console.log(`✅ Wallet del agente: ${agente.publicKey()}`);
console.log(`   Presupuesto: ${PRESUPUESTO} USDC https://stellar.expert/explorer/testnet/tx/${res.hash}`);
