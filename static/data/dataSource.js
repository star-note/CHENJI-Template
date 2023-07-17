var dataSource = {
  'CHENJI-Temple': [
    {
      title: '辰记发布数据',
      content:
        '1Viverra tristique gravida dolor vel aenean egestas libero enim consequat arcu augue euismod est.Viverra tristique gravida dolor vel aenean egestas libero enim consequat arcu augue euismod est.234',
      publishTime: '2023-05-02 08:00:00',
      category: '辰记发布',
      noteId: '1',
    },
  ],
  'CHENJI-Temple2': [
    {
      title: '辰记发布2数据',
      content:
        'Viverra tristique gravida dolor vel aenean egestas libero enim consequat arcu augue euismod est.Viverra tristique gravida dolor vel aenean egestas libero enim consequat arcu augue euismod est.',
      publishTime: '2023-05-02 12:00:00',
      category: '辰记发布2',
      noteId: '2',
    },
    {
      title: '辰记发布2数据2',
      content:
        'Viverra tristique gravida dolor vel aenean egestas libero enim consequat arcu augue euismod est.Viverra tristique gravida dolor vel aenean egestas libero enim consequat arcu augue euismod est.',
      publishTime: '2023-05-01 12:00:00',
      category: '辰记发布2',
      noteId: '3',
    },
  ],
};

/***** 发布时间：2023-07-17 11:17:22（以最后发布的为准）*****/
    dataSource['CHENJI-Temple']=undefined;
    dataSource['CHENJI-Temple2']=undefined;
    const pub = {
      title: '你好',
      content: `<div data-user="4" data-noteId="6" data-pubTime=1689563837020>
        <style type="text/css">
        blockquote{border-left: 4px solid #ccc;padding-left:16px;}
        pre{background: #eee;padding:10px;}
        img{max-width: 100%}
        </style>
        <p><strong style="font-family: 微软雅黑;font-size: 18px">啊违法违法</strong><br/><br/><span style="color:#e60000">请问分awefawe</span><span style="color:#e60000">faw</span><span style="background-color:#008a00">egasdfefserfser</span><span style="background-color:#008a00">gserg</span><br/><br/></p><p style="text-align:right"><em><u>nihao</u></em></p><ol><li>afwef</li><li>aw<span style="color:#008a00">efawef</span></li><li>awefawef</li></ol><p><br/></p><ul><li>sdffgsgs</li><li>afawef</li><li>aefaw</li></ul><p><br/>尊敬的领导：</p><p style="padding-left:3em">氨酚烷胺违法</p><p style="padding-left:3em">阿伟发</p><p>阿尔法违法<br/></p><blockquote>让他二哥哇</blockquote><p><br/></p><pre data-language="javascript">const a = &#x27;aefwefawef&#x27;;</pre><p><br /><img  width="977" style="display: block; margin: auto;" src="http://localhost:8001/files/4-1689301556558.png" /><br /><img  width="189" style="display: inline; float: right; margin: 0px 0px 1em 1em;" src="http://localhost:8001/files/4-1689529395229.png" /><br /><p >wwww</p><br /><p >rfer</p><br /><br /><p >不管高低</p><br /><p >awefawef</p><br /></div>`,
      publishTime: '2023-07-17 11:17:22',
      category: '辰记发布',
      noteId: '6'
    };
    if(dataSource['辰记发布']) {
      const note = dataSource['辰记发布'].filter(function(item){ return item.noteId === '6'});
      if(note && note.length > 0) {
        note[0].title='你好';
        note[0].content=`<div data-user="4" data-noteId="6" data-pubTime=1689563837020>
        <style type="text/css">
        blockquote{border-left: 4px solid #ccc;padding-left:16px;}
        pre{background: #eee;padding:10px;}
        img{max-width: 100%}
        </style>
        <p><strong style="font-family: 微软雅黑;font-size: 18px">啊违法违法</strong><br/><br/><span style="color:#e60000">请问分awefawe</span><span style="color:#e60000">faw</span><span style="background-color:#008a00">egasdfefserfser</span><span style="background-color:#008a00">gserg</span><br/><br/></p><p style="text-align:right"><em><u>nihao</u></em></p><ol><li>afwef</li><li>aw<span style="color:#008a00">efawef</span></li><li>awefawef</li></ol><p><br/></p><ul><li>sdffgsgs</li><li>afawef</li><li>aefaw</li></ul><p><br/>尊敬的领导：</p><p style="padding-left:3em">氨酚烷胺违法</p><p style="padding-left:3em">阿伟发</p><p>阿尔法违法<br/></p><blockquote>让他二哥哇</blockquote><p><br/></p><pre data-language="javascript">const a = &#x27;aefwefawef&#x27;;</pre><p><br /><img  width="977" style="display: block; margin: auto;" src="http://localhost:8001/files/4-1689301556558.png" /><br /><img  width="189" style="display: inline; float: right; margin: 0px 0px 1em 1em;" src="http://localhost:8001/files/4-1689529395229.png" /><br /><p >wwww</p><br /><p >rfer</p><br /><br /><p >不管高低</p><br /><p >awefawef</p><br /></div>`;
        note[0].publishTime='2023-07-17 11:17:22';
      } else {
        dataSource['辰记发布'].push(pub);
      }
    }else{
      dataSource['辰记发布']=[pub];
    }