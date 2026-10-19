import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontMatter, parseYaml, FrontMatterError } from '../lib/frontmatter.js';

test('front matter: scalars, flow list / map, block list, body kept', () => {
  const { data, body } = parseFrontMatter(`---
title: "我的 AI 写作工作流：五个环节"   # comment
summary: 一句话摘要, 带逗号
date: 2026-10-19T08:00:00+08:00
tags: [AI, "写作, 效率", 'it''s']
category: { slug: tech, name: 技术 }
pinned: true
draft: false
also_on:
  - platform: 知乎
    url: https://zhuanlan.zhihu.com/p/1
  - platform: Medium
    url: https://medium.com/@x/y
canonical: https://starnote.app/@demo/8kq2xa
---
<!--sn:article 1-->
<p>正文 --- 不是分隔</p>
`);
  assert.equal(data.title, '我的 AI 写作工作流：五个环节');
  assert.equal(data.summary, '一句话摘要, 带逗号');
  assert.equal(data.date, '2026-10-19T08:00:00+08:00');
  assert.deepEqual(data.tags, ['AI', '写作, 效率', "it's"]);
  assert.deepEqual(data.category, { slug: 'tech', name: '技术' });
  assert.equal(data.pinned, true);
  assert.equal(data.draft, false);
  assert.deepEqual(data.also_on, [
    { platform: '知乎', url: 'https://zhuanlan.zhihu.com/p/1' },
    { platform: 'Medium', url: 'https://medium.com/@x/y' },
  ]);
  assert.equal(data.canonical, 'https://starnote.app/@demo/8kq2xa');
  assert.equal(body, '<!--sn:article 1-->\n<p>正文 --- 不是分隔</p>\n');
});

test('front matter: nested maps, block scalars, toc list of maps', () => {
  const data = parseYaml(`category:
  slug: writing
  name: 写作
summary: |
  第一段
  第二行
toc:
  - { id: h-0-a, level: 2, text: "A: 开头" }
  - id: h-1-b
    level: 3
    text: B
empty:
`);
  assert.deepEqual(data.category, { slug: 'writing', name: '写作' });
  assert.equal(data.summary, '第一段\n第二行');
  assert.deepEqual(data.toc, [
    { id: 'h-0-a', level: 2, text: 'A: 开头' },
    { id: 'h-1-b', level: 3, text: 'B' },
  ]);
  assert.equal(data.empty, null);
});

test('front matter: no fence → whole file is body; unclosed fence is an error', () => {
  assert.deepEqual(parseFrontMatter('<p>x</p>'), { data: {}, body: '<p>x</p>' });
  assert.throws(() => parseFrontMatter('---\ntitle: x\n<p>x</p>'), FrontMatterError);
  assert.throws(() => parseYaml('title: "unclosed'), FrontMatterError);
});
