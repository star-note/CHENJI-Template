var articleItemTpl = `
<div class="blog-item flex hover-img" onclick="onClick('#/blog/{{noteId}}')">
  <div class="blog-item-image" href="#/blog/{{noteId}}">
    <img src="https://assets.website-files.com/62abc23e594f83d9d66b136f/62abe96825e3ea16e4fbacb5_productivity-apps-thumbnail-blog-writelogy-x-webflow-template.jpeg" />
  </div>
  <div class="blog-right hover-margin">
    <h3 class="blog-item-title">{{title}}</h3>
    <p lass="blog-item-desc ellipsis">{{desc}}</p>
    <div class="blog-item-bottom flex">
      <div class="blog-item-category badge-primary" onclick="onClick('#/category/{{category}}')">{{category}}</div>
      <div class="blog-item-time">{{publishTime}}</div>
    </div>
  </div>
</div>`;
var headerTpl = `
<header class="flex-column flex-center">
  <div class="logo">
    <a href="{{layout.homeUrl}}" target="_blank"><img alt="辰记" src="{{ layout.logo }}" /></a>
    <div class="right">
      <a href="layout.githubUrl" target="_blank">
        <svg height="32" aria-hidden="true" viewBox="0 0 16 16" version="1.1" width="32" data-view-component="true" class="octicon octicon-mark-github v-align-middle">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
        </svg>
      </a>
    </div>
  </div>
  <div class="menu flex">
    {{#layout.menu}}
    <section class="flex flex-center" onclick="onClick('{{link}}')">
      <div>{{title}}</div>
      {{#hasSub}}
      <div class="dropdown-arrow flex flex-center">
        <img class="default" src="static/images/arrow.svg" />
        <img class="active" src="static/images/arrow-active.svg" />
      </div>
      <div class="nav-category flex-column">
      {{#sub}}
        <a class="nav-category-item" href="#/category/{{.}}">{{.}}</a>
      {{/sub}}
      </div>
      {{/hasSub}}
    </section>
    {{/layout.menu}}
  </div>
</header>`;
var homeTpl = `
{{#home}}
  <div class="home">
    <div class="first-zone flex">
      <div class="first hover-img" onclick="onClick('#/blog/{{first.noteId}}')">
        <div class="blog-card-bg-container">
          <div class="blog-card-bg-badge-wrapper badge-primary" onclick="onClick('#/category/{{first.category}}')">
            <div>{{first.category}}</div>
          </div>
          <h2 class="blog-bg-title">{{first.title}}</h2>
          <div class="blog-card-details-container">
            <div class="blog-card-bg-date-container">
              <div class="text-100 bold color-neutral-100">{{first.publishTime}}</div>
            </div>
          </div>
        </div>
        <img src="static/images/banner01.png" class="blog-card-bg-image" alt="" />
      </div>
      
      <div class="right-list">
      {{#right}}
        <div class="article-item flex hover-img" onclick="onClick('#/blog/{{noteId}}')">
          <div class="hover-margin" style="flex: 1;">
            <div class="article-item-category" onclick="onClick('#/category/{{category}}')">{{category}}</div>
            <div class="article-item-title">{{title}}</div>
          </div>
          <div class="article-item-image">
            <img src="https://assets.website-files.com/62abc23e594f83d9d66b136f/62abe96825e3ea16e4fbacb5_productivity-apps-thumbnail-blog-writelogy-x-webflow-template.jpeg" />
          </div>
        </div>
        {{/right}}
      </div>
    </div>
    <div class="lastest-blogs">
      <h2>最近文章</h2>
      {{#allNotes}}
      ${articleItemTpl}
      {{/allNotes}}
    </div>
  </div>
{{/home}}`;
var articleTpl = `
{{#article}}
  <div class="article-header">
    <a class="article-item-category" href="#/category/{{category}}">{{category}}</a>
    <h1 class="article-title">{{title}}</h1>
    <p>{{publishTime}}</p>
  </div>
  <div class="article-content">
    {{content}}
  </div>
{{/article}}`;
var template = `
  <div class="layout">
    ${headerTpl}
    ${homeTpl}
    
    ${homeTpl.replace('{{#home}}', '{{#category}}').replace('{{/home}}', '{{/category}}')}
    ${articleTpl}
  </div>
`;

// 核心加载数据的模板主入口，不同模板这个函数名不能改，里面执行可以改
function loadData() {
  const cssePath = 'static/templates/' + window.TEMPTYPE + '/index.css';
  loadCss(cssePath);

  return loadScript('static/data/layout.js').then(function () {
    return loadScript('static/data/dataSource.js').then(function () {
      // 处理 layout 的数据使能有 category 的下拉列表
      const category = Object.keys(window.dataSource).filter(function(key) {
        return window.dataSource[key] && window.dataSource[key].length > 0;
      });
      const categoryItem = window.layout.menu.filter(function (item) {
        return item.title === '文章分类';
      })[0];
      categoryItem.sub = category;
      categoryItem.hasSub = true;

      window.addEventListener(
        'hashchange',
        function (e) {
          window.render(processHash());
        },
        false,
      );

      if (!window.location.hash) {
        const home = processHome();
        console.log(category, home, layout);
        return {
          layout: window.layout,
          home: home,
        };
      } else {
        // 页面刷新
        return processHash();
      }
    });
  });
}

function processHome() {
  const category = Object.keys(window.dataSource);
  for (let i = 0; i < category.length; i++) {
    sort(window.dataSource[category[i]]);
  }

  let show = [];
  let allNotes = [];

  for (let j = 0; j < category.length; j++) {
    if (window.dataSource[category[j]]) {
      show.push(window.dataSource[category[j]][0]);
      allNotes = allNotes.concat(window.dataSource[category[j]]);
    }
  }
  show = sort(show);
  const first = show.shift();

  return {
    first: addNoteListProps(first),
    right: addNoteListProps(show),
    allNotes: addNoteListProps(sort(allNotes)
      .filter(function (note) {
        return (
          note.noteId !== first.noteId &&
          show
            .map(function (note) {
              return note.noteId;
            })
            .indexOf(note.noteId) === -1
        );
      }))
  };
}

function processCategory(category) {
  const allNotes = sort(window.dataSource[category]);
  if (allNotes && allNotes.length > 0) {
    return {
      first: addNoteListProps(allNotes[0]),
      right: addNoteListProps(allNotes.slice(1, 4)),
      allNotes: addNoteListProps(allNotes.splice(4))
    };
  } else {
    return {
      first: undefined,
      right: undefined,
      allNotes: undefined,
    }
  }
  
}

function sort(arr) {
  if (arr && arr.length > 0) {
    arr.sort(function (a, b) {
      if (a.publishTime < b.publishTime) return 1;
      if (a.publishTime > b.publishTime) return -1;
      return 0;
    });
  }
  return arr;
}

// 路由控制基础函数
function processHash() {
  const hash = window.location.hash;
  let result;
  if (hash === '#/') {
    result = {
      home: processHome(),
      layout: window.layout,
    };
  } else if (hash === '#/about') {
    result = {
      layout: window.layout,
    }; // TODO
  } else if (hash === '#/concat') {
    result = {
      layout: window.layout,
    }; // TODO
  } else if (hash.indexOf('#/category') === 0) {
    const category = window.decodeURI(hash.match(/#\/category\/(.+)/)[1]);
    result = {
      layout: window.layout,
      category: processCategory(category),
    };
  } else if (hash.indexOf('#/blog') === 0) {
    const noteId = window.decodeURI(hash.match(/#\/blog\/(.+)/)[1]);
    const category = Object.keys(window.dataSource);
    let allNotes = [];
    for (let j = 0; j < category.length; j++) {
      allNotes = allNotes.concat(window.dataSource[category[j]]);
    }

    result = {
      layout: window.layout,
      article: allNotes.filter(function (note) {
        return note && note.noteId === noteId;
      })[0],
    };
  }

  return result;
}

function onClick(hash) {
  console.log(hash);
  if (hash) {
    window.location.hash = hash;
    window.event.stopPropagation();
  }
}

// 给笔记或笔记数组添加 desc/html 字段
function addNoteListProps(noteList) {
  if (noteList instanceof Array) {
    noteList.map(function(note) {
      return {
        ...note,
        desc: filterHtml(note.content),
        allImgs: getImgSrc(note.content)
      }
    })
  } else if (noteList) {
    return {
      ...noteList,
      desc: filterHtml(noteList.content),
      allImgs: getImgSrc(noteList.content),
    };
  }
}
