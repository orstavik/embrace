# embrace
Template engine 

https://cdn.jsdelivr.net/gh/orstavik/embrace@26.02.05.09/DDauto.js
https://cdn.jsdelivr.net/gh/orstavik/embrace@26.02.05.09/DDRender.js

```html
<script type="module" 
  src="https://cdn.jsdelivr.net/gh/orstavik/embrace@26.02.05.09/DDauto.js"></script>
<script type="module">
  import { renderUnder, getDefinitions } 
    from "https://cdn.jsdelivr.net/gh/orstavik/embrace@26.02.05.09/DDRender.js";

  while (!Object.keys(getDefinitions()).length)
    await new Promise(requestAnimationFrame);
  renderUnder(document.body, { "key": "value" });
</script>
```

## work in progress
1. class for the Def. Call it StampType.
2. DDRender. The extractUnusedInnerReusables(Def) is untested!!
   make a test for the extractUnusedInnerReusables(Def). This will require reuse of common template ids.
   this is actually a little tricky. We can reuse the same dom if the insides of the templates are identical, 
   regardless of the if and for. This means that we actually would like the start and end nodes not be part of the same system.
3. fix the getInstance function so it is also a Stamp. That way we can hide #nodes and #start in the Stamp.
4. 