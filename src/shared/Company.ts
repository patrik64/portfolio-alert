import { Entity, Fields } from 'remult';

@Entity<Company>('companies', {
	allowApiRead: true, // mutations only happen in backend code (ScrapeController)
	defaultOrderBy: { name: 'asc' }
})
export class Company {
	// deterministic `${fundSlug}:${normalized name}` — makes inserts idempotent
	@Fields.string()
	id = '';

	@Fields.string()
	fundSlug = '';

	@Fields.string()
	name = '';

	@Fields.string()
	category = '';

	@Fields.string()
	url = '';

	// set when a fetch finds a company that wasn't in the database; cleared on
	// the fund's next successful fetch. (Named isNewcomer because remult's type
	// helpers reserve every EntityBase member name, including isNew.)
	@Fields.boolean()
	isNewcomer = false;

	// set on the rows a fund's very first fetch imports — the portfolio as it
	// already stood, which the timeline only shows on request
	@Fields.boolean()
	isBaseline = false;

	@Fields.createdAt()
	firstSeenAt?: Date;
}
