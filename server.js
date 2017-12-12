'use strict'

const URL = require('url')
const crypto = require('crypto')
const Koa = require('koa')
const Router = require('koa-router')
const Parser = require('koa-bodyparser')
const Cors = require('koa-cors')
const ILP = require('ilp')
const Plugin = require('ilp-plugin-xrp-escrow')

const port = process.env.PORT || 3000

const app = new Koa()
const router = new Router()

const credentials = {
  secret: process.env.XRP_SECRET,
  account: process.env.XRP_ACCOUNT,
  server: 'wss://s.altnet.rippletest.net:51233',
  prefix: 'test.crypto.xrp.'
}

const plugin = new Plugin(credentials)
const secret = crypto.randomBytes(32)

// Webfinger
router.get('/.well-known/webfinger', (ctx) => {
  const body = {
    subject: ctx.request.query.resource,
    links: [{
      rel: 'https://interledger.org/rel/ledgerUri',
      href: 'there is no ledger'
    }, {
      rel: 'https://interledger.org/rel/ilpAddress',
      href: plugin.getInfo().prefix + 'client'
    }, {
      rel: 'https://interledger.org/rel/spsp/v2',
      href: serverUrl
    }]
  }
  ctx.set('Access-Control-Allow-Origin', '*')
  ctx.body = body
})

// SPSP
router.get('/', async (ctx) => {
  console.log('got spsp query')
  const ilpAddress = plugin.getInfo().prefix + 'client'
  const psk = ILP.PSK.generateParams({
    destinationAccount: ilpAddress,
    receiverSecret: secret
  })

  ctx.set('Access-Control-Allow-Origin', '*')
  ctx.body = {
    destination_account: psk.destinationAccount,
    shared_secret: psk.sharedSecret,
    maximum_destination_amount: '99999999', // TODO change this
    minimum_destination_amount: '1',
    ledger_info: {
      currency_code: plugin.getInfo().currencyCode,
      currency_scale: plugin.getInfo().currencyScale
    },
    // TODO add reciever info
    receiver_info: {
      name: 'Cicada',
      image_url: 'https://i.imgur.com/fGrYkX6.jpg',
      identifier: ''
    }
  }
})

app
  .use(Parser())
  .use(Cors({
    origin: '*',
    methods: ['GET', 'POST']
  }))
  .use(router.routes())
  .use(router.allowedMethods())

async function main () {
  console.log(credentials)
  await plugin.connect()
  await plugin.getInfo()
  console.log('plugin connected')
  plugin.on('error', (err) => {
    console.error('plugin error:', err)
  })

  await ILP.PSK.listen(plugin, {
    receiverSecret: secret
  }, async (incomingPayment) => {
    // TODO add webhook
    try {
      await incomingPayment.fulfill()
    } catch (err) {
      console.error('error fulfilling incoming payment', incomingPayment, err)
    }
    console.log('got incoming payment', incomingPayment)
  })

  app.listen(port)
  console.log('cicada chirping on: ' + port)
}

main().catch(err => console.error(err))
