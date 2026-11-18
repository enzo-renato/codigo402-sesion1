import { Transaction, TransactionBuilder, Horizon, Asset } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { createEd25519Signer, getNetworkPassphrase } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

// Agente autónomo: paga la API x402 con su propia wallet y un presupuesto máximo de 0.05 USDC.
const AGENTE_SECRETA = process.env.AGENTE_SECRETA;
const RESOURCE_SERVER_URL = "http://localhost:3001";
const ENDPOINT_PATH = "/dato";
const NETWORK = "stellar:testnet";
const STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
const PRESUPUESTO = 0.05;
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

if (!AGENTE_SECRETA) throw new Error("Falta AGENTE_SECRETA en .env");

function aHex(hash) {
  return typeof hash === "string" ? hash : Buffer.from(hash).toString("hex");
}

function aNumero(valor) {
  const n = Number(valor);
  // Los importes también pueden venir en unidades atómicas (USDC de Stellar usa 7 decimales).
  return n > 1000 ? n / 10_000_000 : n;
}

async function saldoUSDC(horizon, address) {
  const cuenta = await horizon.loadAccount(address);
  const b = cuenta.balances.find(
    (x) => x.asset_type === "credit_alphanum4" && x.asset_code === "USDC" &&
      x.asset_issuer === USDC.issuer,
  );
  return b ? Number(b.balance) : 0;
}

async function main() {
  const url = new URL(ENDPOINT_PATH, RESOURCE_SERVER_URL).toString();
  const signer = createEd25519Signer(AGENTE_SECRETA, NETWORK);
  const rpcConfig = STELLAR_RPC_URL ? { url: STELLAR_RPC_URL } : undefined;
  const client = new x402Client().register("stellar:*", new ExactStellarScheme(signer, rpcConfig));
  const httpClient = new x402HTTPClient(client);
  const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");

  console.log(`Target: ${url}\nAgente: ${signer.address}`);
  const disponible = await saldoUSDC(horizon, signer.address);
  console.log(`Presupuesto disponible: ${disponible} USDC`);
  if (disponible <= 0) throw new Error("El agente no tiene USDC disponible");

  // 1. Pide sin pagar: la API responde 402 con las instrucciones.
  const firstTry = await fetch(url);
  console.log(`Payment requested: ${firstTry.status}`);
  const paymentRequired = httpClient.getPaymentRequiredResponse((name) => firstTry.headers.get(name));

  // 2. Comprobación de presupuesto antes de firmar nada.
  const precio = aNumero(paymentRequired.accepts?.[0]?.amount ?? 0.01);
  console.log(`Precio solicitado: ${precio} USDC`);
  if (precio > PRESUPUESTO || precio > disponible) {
    throw new Error(`Pago de ${precio} USDC fuera del presupuesto (${PRESUPUESTO} / ${disponible})`);
  }

  // 3. Arma y firma el pago con la wallet del agente.
  let paymentPayload = await client.createPaymentPayload(paymentRequired);
  const networkPassphrase = getNetworkPassphrase(NETWORK);
  const tx = new Transaction(paymentPayload.payload.transaction, networkPassphrase);
  const envelope = tx.toEnvelope();
  if (envelope.type !== "envelopeTypeTx") throw new Error("Expected a v1 transaction envelope");
  const txExt = envelope.value.tx.ext;
  const sorobanData = txExt.type === "sorobanData" ? txExt.value : undefined;
  let txHash = aHex(tx.hash());

  // Comisión de 1 stroop, como en el ejemplo oficial (límite del facilitador de testnet).
  if (sorobanData) {
    const rebuilt = TransactionBuilder.cloneFrom(tx, { fee: "1", sorobanData, networkPassphrase }).build();
    txHash = aHex(rebuilt.hash());
    paymentPayload = {
      ...paymentPayload,
      payload: {
        ...paymentPayload.payload,
        transaction: rebuilt.toXDR(),
      },
    };
  }

  // 4. Vuelve a pedir, ahora con el pago firmado.
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paidResponse = await fetch(url, { method: "GET", headers: paymentHeaders });
  const text = await paidResponse.text();
  const paymentResponse = httpClient.getPaymentSettleResponse((name) => paidResponse.headers.get(name));

  // El facilitador puede reconstruir el tx (sponsor de fees): el hash definitivo es el del settlement.
  const hashEnCadena = /^[0-9a-f]{64}$/i.test(paymentResponse?.transaction ?? "")
    ? paymentResponse.transaction
    : txHash;
  console.log(`HASH=${hashEnCadena}`);
  console.log("Settlement response:", paymentResponse);
  console.log(`Acceso concedido: ${paidResponse.status} ${text}`);
  console.log(`Presupuesto restante: ${(await saldoUSDC(horizon, signer.address)).toFixed(2)} USDC`);
}

main().catch((error) => {
  console.error("Agente falló:", error);
  process.exit(1);
});
