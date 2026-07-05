## Firstly rebrand pgm, with a full form Project God Mode
## Secondly
I am thinking of a flow where for a given PR, I am go and comment on the files about any required changes, trigger a command like pgm-address-comments <TICKET_ID> or <JIRA_ID>, it will go fetch the PR for unresolved comments, add it to TICKET as conversations, analyse comments, make changes if required, respond back questions if there are queries to the PR conversations, if done Mark resolved, I will mark resolved if the reply is satisfactory or changes upon request looks good. if any changes are made for a comment, comment back saying addressed. every comment made by PGM needs to start with [PGM_BOT] so you can identify the conversations, update all these to the TICKET md for every address-comments session. 

You will also have to store the pr url in ticket md to be able to achieve it.

Have this conversations shown in pgm ui
also suggest a good / better name for this command.

Before doing any of this, first tell me what do you think of this feature ? I am kind of going in a reverse order, generally ai would comment on that prs we raise, this is kind of reverse.