import { Keypair, Horizon, TransactionBuilder, Networks, Asset, TimeoutInfinite, Operation } from '@stellar/stellar-sdk';

const server = new Horizon.Server("https://horizon-testnet.stellar.org");

const miLlaveSecreta = "SB6OG3SRW6PVYTLEAPMBMRO5MZPE7BIEUSWBCHHRB2CHIAZYSNANBTA5";
const llavePublicaDestino = "GAB54KEZ7ZOXY2QWCML3NDVL3PFF3F56P7ZUJBM3YTIL5L2S42EGKA3P";

const parDeClaves = Keypair.fromSecret(miLlaveSecreta);
const cuentaOrigen = await server.loadAccount(parDeClaves.publicKey());

const transaccion = new TransactionBuilder(cuentaOrigen, {
    fee: await server.fetchBaseFee(),
    networkPassphrase: Networks.TESTNET
})
.addOperation(Operation.payment({
    destination: llavePublicaDestino,
    asset: Asset.native(), // XLM
    amount: "10" // Monto a enviar
}))
.setTimeout(TimeoutInfinite)
.build();

transaccion.sign(parDeClaves);
const resultado = await server.submitTransaction(transaccion);

console.log("¡Pago enviado con éxito! Hash de la transacción:", resultado.hash);