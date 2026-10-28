import test from 'node:test'
import assert from 'node:assert/strict'
import { assetFilename, canvasIdForPath, catalogWarnings } from './helpers.js'

test('verified MIME filename extensions are preserved, including JPEG aliases and casing', () => {
  for (const [name, mime, expected] of [
    ['photo', 'image/jpeg', 'photo.jpg'], ['photo.jpg', 'image/jpeg', 'photo.jpg'],
    ['photo.jpeg', 'image/jpeg', 'photo.jpeg'], ['photo.JpEg', 'image/jpeg', 'photo.JpEg'],
    ['photo.png', 'image/png', 'photo.png'], ['photo.PNG', 'image/png', 'photo.PNG'],
    ['body', 'font/woff', 'body.woff'], ['heading', 'font/otf', 'heading.otf'],
    ['logo', 'image/svg+xml', 'logo.svg'],
  ]) assert.equal(assetFilename({name,mime}), expected)
})

test('every supported current and legacy editor path has an explicit canvas identity', () => {
  for (const app of ['photo', 'vector', 'effect', 'film', 'fig']) {
    for (const suffix of ['flow', 'craft']) assert.equal(canvasIdForPath('/'+app+suffix+'/1.0/'), app+'craft_canvas')
  }
  assert.equal(canvasIdForPath('/soundflow/'), null)
  assert.equal(canvasIdForPath('/unknown/'), null)
})

test('catalog warnings accept only bounded text', () => {
  const input = ['<img src=x>', {html:'bad'}, ...Array(8).fill('a'.repeat(1000))]
  const warnings = catalogWarnings(input)
  assert.equal(warnings.length, 5)
  assert.equal(warnings[0], '<img src=x>')
  assert.ok(warnings.every(w => typeof w === 'string' && w.length <= 240))
})
