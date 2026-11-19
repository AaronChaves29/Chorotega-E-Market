import * as os from 'node:os';
import { MongoClient } from 'mongodb';
import { validateEnvironment } from '../config/environment';
import { provisionOrderAudits } from '../modules/order-audits/provision-order-audits';

/** Deliberate operator command; never invoked by application startup or migrations. */
export async function provision(): Promise<void> {
  validateEnvironment(process.env, 'production');
  const client = new MongoClient(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 10000,
    runtimeAdapters: { os },
  });
  try {
    await client.connect();
    await provisionOrderAudits(client.db(process.env.MONGODB_DATABASE));
  } finally {
    await client.close();
  }
}
if (require.main === module)
  void provision().then(
    () => {
      process.stdout.write('Aprovisionamiento de bitácora completado.\n');
    },
    () => {
      process.stderr.write(
        'No se completó el aprovisionamiento de bitácora.\n',
      );
      process.exitCode = 1;
    },
  );
