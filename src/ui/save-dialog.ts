/** Reuses the existing centered dialog appearance and native modal focus/Escape behavior. */
export function createSaveDialog(save:(name:string)=>void): (name:string)=>void {
  const dialog=document.createElement('dialog');dialog.className='line-limit-dialog save-dialog'
  dialog.setAttribute('aria-labelledby','save-name-title')
  const form=document.createElement('form')
  const title=document.createElement('h2');title.id='save-name-title';title.textContent='保存ファイル名'
  const label=document.createElement('label');label.htmlFor='save-name';label.textContent='ファイル名'
  const input=document.createElement('input');input.id='save-name';input.type='text';input.required=true;input.autocomplete='off'
  const actions=document.createElement('div');actions.className='save-dialog-actions'
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='キャンセル'
  const confirm=document.createElement('button');confirm.type='submit';confirm.className='primary';confirm.textContent='保存'
  cancel.addEventListener('click',()=>dialog.close())
  input.addEventListener('input',()=>input.setCustomValidity(''))
  form.addEventListener('submit',event=>{
    event.preventDefault()
    if(!input.value.trim()) {input.setCustomValidity('ファイル名を入力してください。');input.reportValidity();return}
    save(input.value) // Preserve the entered name, including its extension.
    dialog.close()
  })
  actions.append(cancel,confirm);form.append(title,label,input,actions);dialog.append(form);document.body.append(dialog)
  return name=>{
    if(dialog.open) return
    input.value=name;input.setCustomValidity('');dialog.showModal();input.focus();input.select()
  }
}
