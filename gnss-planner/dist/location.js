export function initLocationUI(selectLocation){
 const $=id=>document.getElementById(id);
 let map,marker,current={lat:35.681236,lon:139.767125},lastKey='',timer,controller,revision=0;
 function showMarker(){if(!map)return;const point=[current.lat,current.lon];marker.setLatLng(point);map.setView(point,map.getZoom());}
 $('mapDetails').addEventListener('toggle',()=>{
  if(!$('mapDetails').open)return;
  if(!map){
   map=L.map('locationMap',{scrollWheelZoom:false}).setView([current.lat,current.lon],14);
   L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',{minZoom:2,maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>'}).on('tileerror',()=>{$('mapStatus').textContent='地図画像を取得できません。通信状況を確認するか、緯度・経度で指定してください。';}).addTo(map);
   marker=L.circleMarker([current.lat,current.lon],{radius:9,color:'#fff',weight:3,fillColor:'#176fa0',fillOpacity:1}).addTo(map);
   map.on('click',e=>{const p=e.latlng.wrap();if(Math.abs(p.lat)>85)return;selectLocation(p.lat,p.lng);});
  }
  map.invalidateSize();
 });
 $('mapCenter').onclick=()=>{if(map){const p=map.getCenter().wrap();selectLocation(p.lat,p.lng);}};
 $('mapReturn').onclick=showMarker;
 return (observer,confirmed=true)=>{
  current={lat:observer.lat,lon:observer.lon};
  const key=`${confirmed}:${observer.lat.toFixed(5)},${observer.lon.toFixed(5)}`;
  if(lastKey===key)return;lastKey=key;showMarker();
  $('mapCoordinates').textContent=`評価地点：緯度 ${observer.lat.toFixed(6)} / 経度 ${observer.lon.toFixed(6)}`;
  $('addressText').textContent='住所を確認中…';$('addressSource').textContent='';
  const version=++revision;clearTimeout(timer);controller?.abort();
  if(!confirmed){$('addressText').textContent='現在地の住所は未取得です';$('mapCoordinates').textContent='プレビュー地点：東京駅付近（現在地ではありません）';return;}
  timer=setTimeout(async()=>{controller=new AbortController();
   try{const r=await fetch(`/api/address?lat=${observer.lat}&lon=${observer.lon}`,{signal:controller.signal});if(!r.ok)throw Error();const data=await r.json();if(version!==revision)return;$('addressSource').textContent='住所情報：'+data.source;$('addressText').textContent=data.address||'住所を特定できません（日本国外・海上など）。緯度・経度は設定済みです。';}
   catch(e){if(version===revision&&e.name!=='AbortError')$('addressText').textContent='住所を取得できません。緯度・経度での評価は利用できます。';}
  },800);
 };
}
