import tape from 'tape'
import td from 'testdouble'
import { Config } from '../../../lib/config'
import { BN } from 'ethereumjs-util'
import { Chain } from '../../../lib/blockchain'
import { Event } from '../../../lib/types'

tape('[HeaderFetcher]', async (t) => {
  class PeerPool {
    idle() {}
    ban() {}
  }
  PeerPool.prototype.idle = td.func<any>()
  PeerPool.prototype.ban = td.func<any>()
  td.replace('../../lib/net/peerpool', { PeerPool })

  const { HeaderFetcher } = await import('../../../lib/sync/fetcher/headerfetcher')

  t.test('should process', (t) => {
    const config = new Config({ transports: [] })
    const pool = new PeerPool()
    const flow = td.object()
    const fetcher = new HeaderFetcher({ config, pool, flow })
    const headers = [{ number: 1 }, { number: 2 }]
    t.deepEquals(
      //@ts-ignore
      fetcher.process({ task: { count: 2 }, peer: 'peer0' }, { headers, bv: new BN(1) }),
      headers,
      'got results'
    )
    //@ts-ignore
    t.notOk(fetcher.process({ task: { count: 2 } }, { headers: [], bv: new BN(1) }), 'bad results')
    td.verify((fetcher as any).flow.handleReply('peer0', 1))
    t.end()
  })

  t.test('should find a fetchable peer', async (t) => {
    const config = new Config({ transports: [] })
    const pool = new PeerPool()
    const fetcher = new HeaderFetcher({ config, pool })
    td.when((fetcher as any).pool.idle(td.matchers.anything())).thenReturn('peer0')
    //@ts-ignore
    t.equals(fetcher.peer(undefined), 'peer0', 'found peer')
    t.end()
  })

  t.test('store()', async (st) => {
    st.plan(2)

    const config = new Config({ maxPerRequest: 5, transports: [] })
    const pool = new PeerPool() as any
    const chain = new Chain({ config })
    chain.putHeaders = td.func<any>()
    const fetcher = new HeaderFetcher({
      config,
      pool,
      chain,
      first: new BN(1),
      count: new BN(10),
      timeout: 5,
    })
    td.when(chain.putHeaders([0 as any])).thenReject(new Error('err0'))
    try {
      await fetcher.store([0 as any])
    } catch (err: any) {
      st.ok(err.message === 'err0', 'store() threw on invalid header')
    }
    td.when(chain.putHeaders([1 as any])).thenResolve(1)
    config.events.on(Event.SYNC_FETCHER_FETCHED, () =>
      st.pass('store() emitted SYNC_FETCHER_FETCHED event on putting headers')
    )
    await fetcher.store([1 as any])
  })

  t.test('should reset td', (t) => {
    td.reset()
    t.end()
  })
})
