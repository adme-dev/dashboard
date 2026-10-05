export const source = `<style>
#designContainer{width:300px;height:250px;background:#fff}
#element-1{position:absolute;left:10px;top:20px;width:200px;height:80px}
.row{font-family:Arial;font-size:24px;font-weight:700;color:#000;line-height:1.2}
#effIn1{width:100%;height:100%;animation-name:enter;animation-duration:1s;animation-delay:-1ms;animation-timing-function:cubic-bezier(.165,.84,.44,1);animation-iteration-count:1;animation-direction:normal}
@keyframes enter{0%{transform:translateX(-100px) translateY(0);opacity:0}100%{transform:translateX(0) translateY(0);opacity:1}}
</style><script>window.creatopyEmbed={designData:{width:300,height:250,loopCount:0,animations:[{type:"slide",id:1,duration:4000,effInDuration:0,effOutDuration:0,elements:[{id:1,from:200}]}],customAnimations:[]}};throw new Error('never execute');</script>
<div id="designContainer"><div id="slide-1"><div id="element-1" data-eltype="text"><div id="effIn1"><div class="row">Hello world</div></div></div></div></div>`
