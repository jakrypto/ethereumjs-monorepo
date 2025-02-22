import tape from 'tape'
import td from 'testdouble'
import { Log } from '@ethereumjs/vm/dist/evm/types'
import { BN } from 'ethereumjs-util'
import { Config } from '../../lib/config'
import { Event } from '../../lib/types'
const level = require('level-mem')

tape('[FullEthereumService]', async (t) => {
  class PeerPool {
    open() {}
    close() {}
    start() {}
    stop() {}
  }
  PeerPool.prototype.open = td.func<any>()
  PeerPool.prototype.close = td.func<any>()
  PeerPool.prototype.start = td.func<any>()
  PeerPool.prototype.stop = td.func<any>()
  td.replace('../../lib/net/peerpool', { PeerPool })
  const Chain = td.constructor([] as any)
  Chain.prototype.open = td.func<any>()
  td.replace('../../lib/blockchain', { Chain })
  const EthProtocol = td.constructor([] as any)
  const LesProtocol = td.constructor([] as any)
  td.replace('../../lib/net/protocol/ethprotocol', { EthProtocol })
  td.replace('../../lib/net/protocol/lesprotocol', { LesProtocol })
  class FullSynchronizer {
    start() {}
    stop() {}
    open() {}
    close() {}
    handleNewBlock() {}
    execution = {
      receiptsManager: { getReceipts: td.func<any>() },
    }
  }
  FullSynchronizer.prototype.start = td.func<any>()
  FullSynchronizer.prototype.stop = td.func<any>()
  FullSynchronizer.prototype.open = td.func<any>()
  FullSynchronizer.prototype.close = td.func<any>()
  FullSynchronizer.prototype.handleNewBlock = td.func<any>()
  td.replace('../../lib/sync/fullsync', { FullSynchronizer })

  class Block {
    static fromValuesArray() {
      return {}
    }
  }
  td.replace('@ethereumjs/block', { Block })
  const { FullEthereumService } = await import('../../lib/service/fullethereumservice')

  t.test('should initialize correctly', (t) => {
    const config = new Config({ transports: [] })
    const service = new FullEthereumService({ config })
    t.ok(service.synchronizer instanceof FullSynchronizer, 'full mode')
    t.equals(service.name, 'eth', 'got name')
    t.end()
  })

  t.test('should get protocols', (t) => {
    let config = new Config({ transports: [] })
    let service = new FullEthereumService({ config })
    t.ok(service.protocols[0] instanceof EthProtocol, 'full protocol')
    t.notOk(service.protocols[1], 'no light protocol')
    config = new Config({ transports: [], lightserv: true })
    service = new FullEthereumService({ config })
    t.ok(service.protocols[0] instanceof EthProtocol, 'full protocol')
    t.ok(service.protocols[1] instanceof LesProtocol, 'lightserv protocols')
    t.end()
  })

  t.test('should open', async (t) => {
    t.plan(3)
    const server = td.object() as any
    const config = new Config({ servers: [server] })
    const service = new FullEthereumService({ config })
    await service.open()
    td.verify(service.synchronizer.open())
    td.verify(server.addProtocols(td.matchers.anything()))
    service.config.events.on(Event.SYNC_SYNCHRONIZED, () => t.pass('synchronized'))
    service.config.events.on(Event.SYNC_ERROR, (err) => {
      if (err.message === 'error0') t.pass('got error 1')
    })
    service.config.events.emit(Event.SYNC_SYNCHRONIZED, new BN(0))
    service.config.events.emit(Event.SYNC_ERROR, new Error('error0'))
    service.config.events.on(Event.SERVER_ERROR, (err) => {
      if (err.message === 'error1') t.pass('got error 2')
    })
    service.config.events.emit(Event.SERVER_ERROR, new Error('error1'), server)
    await service.close()
  })

  t.test('should start/stop', async (t) => {
    const server = td.object() as any
    const config = new Config({ servers: [server] })
    const service = new FullEthereumService({ config })
    await service.start()
    td.verify(service.synchronizer.start())
    t.notOk(await service.start(), 'already started')
    await service.stop()
    td.verify(service.synchronizer.stop())
    t.notOk(await service.stop(), 'already stopped')
    t.end()
  })

  t.test('should call handleNewBlock on NewBlock', async (t) => {
    const config = new Config({ transports: [] })
    const service = new FullEthereumService({ config })
    await service.handle({ name: 'NewBlock', data: [{}, new BN(1)] }, 'eth', undefined as any)
    td.verify(service.synchronizer.handleNewBlock({} as any, undefined))
    t.end()
  })

  t.test('should send Receipts on GetReceipts', async (t) => {
    const config = new Config({ transports: [] })
    const service = new FullEthereumService({ config, metaDB: level() })
    const blockHash = Buffer.alloc(32, 1)
    const receipts = [
      {
        status: 1 as 0 | 1,
        gasUsed: new BN(100).toArrayLike(Buffer),
        bitvector: Buffer.alloc(256),
        logs: [
          [Buffer.alloc(20), [Buffer.alloc(32), Buffer.alloc(32, 1)], Buffer.alloc(10)],
        ] as Log[],
        txType: 2,
      },
      {
        status: 0 as 0 | 1,
        gasUsed: new BN(1000).toArrayLike(Buffer),
        bitvector: Buffer.alloc(256, 1),
        logs: [
          [Buffer.alloc(20, 1), [Buffer.alloc(32, 1), Buffer.alloc(32, 1)], Buffer.alloc(10)],
        ] as Log[],
        txType: 0,
      },
    ]
    td.when(
      service.synchronizer.execution.receiptsManager!.getReceipts(blockHash, true, true)
    ).thenResolve(receipts)
    const peer = { eth: { send: td.func() } } as any
    await service.handle({ name: 'GetReceipts', data: [new BN(1), [blockHash]] }, 'eth', peer)
    td.verify(peer.eth.send('Receipts', { reqId: new BN(1), receipts }))
    t.end()
  })

  t.test('should reset td', (t) => {
    td.reset()
    t.end()
  })
})
